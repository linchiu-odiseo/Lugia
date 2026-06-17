# fase-3-exam-submit-learnex — Design

## Context

Este change cierra el último escalón funcional de Fase 3. Después de `fase-3-login-learnex` (auth real contra learnex) y `fase-3-exam-list-learnex` (listado real + envío stub), la PWA puede marcar pero **no entrega**: `HttpExamsApi.enviar` lanza `SubmissionNotAvailableError` síncronamente, sin tocar HTTP. La razón fue deliberada: el contrato del POST no estaba definido cuando se cerró el listado.

learnex publicó el contrato (`.authentic/contrato-pwa-submit.md` + handoff del back en checkpoint): endpoint `POST /t/{slug}/student/exam-sessions/{sessionId}/submit`, body `{ code, responses, client_finished_at }`, response 201 `{ id, submission_hash, submitted_at }`, idempotencia server-side. La PWA ahora puede cerrar el ciclo.

Más allá de cablear el POST, este change activa **dead code intencional** que `fase-3-exam-list-learnex` dejó preparado: las ramas `enviado` del card-state en /home (compose con `hasSubmittedAck`), el dispatcher de retry on-reconnect (procesando `NetworkError` real en vez de un stub), y la persistencia del comprobante criptográfico devuelto por el server. El usuario lo pidió enriqueciendo con un **modal de comprobante** centrado con backdrop blur, hash en bloque 4×4×4, y copy "Pendiente de calificación" en la card de /home una vez enviado.

## Goals / Non-goals

**Goals**
- Reemplazar el stub de `ExamsApi.enviar` por POST real al contrato learnex.
- Persistir el `SubmissionAck` (`id`, `submission_hash`, `submitted_at`) como comprobante criptográfico recuperable.
- Activar las ramas vivas del card-state `enviado` en `/home` (hoy dead code intencional).
- Mostrar modal de comprobante post-201 cuando el alumno está en `/simulacro`.
- Mantener el reintento automático del queue offline funcionando con el POST real (sin botón manual).
- Eliminar `SubmissionNotAvailableError` y todas sus referencias (cleanup completo).

**Non-goals**
- Backoff exponencial in-flight para 429/500 — diferido a hardening change futuro.
- Header `X-Pwa-Version` — el back lo postergó explícitamente.
- Pantalla de comprobante histórico tocando una card "enviado" en `/home` — feature posterior.
- Notificación push tras éxito desde el queue procesado en background — overkill.
- Toast efímero "conexión recuperada" — descartado en checkpoint UX minimalista.
- Consumo del SSE `examReady` de Fase 2 — change futuro.
- Migración de IDB schema — los datos de marcaciones existentes no se tocan; el nuevo namespace de acks es aditivo.

## Decisions

### D1: `EnvioRequest` reshape con `code` (DNI) explícito

**Chosen.** El L1 port `ExamsApi.enviar` recibe `EnvioRequest = { examId, code, responses, clientFinishedAt }`.

Alternativas: (a) el use case lee el DNI del `IdentityStorage` internamente y lo pasa al port en la request (este chosen), (b) el adapter L3 lee identity directamente y arma el body (rompe limpieza de port), (c) el view-model lo pasa al use case por parámetro (acoplamiento UI ↔ dominio).

Rationale: el port debe llevar todo lo necesario para emitir el POST; el use case L2 es quien resuelve identity y arma la request. Patrón consistente con cómo `MarkingsStorage` resuelve `userEmail` internamente — pero ese caso es de adapter L3 (acceso a `IdentityStorage` desde L3 ya existe). Acá el `code` es dato de dominio que viaja por el port, no detalle de adapter.

### D2: `EnviarSimulacroUseCase` inyecta `IdentityStorage` como cuarto puerto

**Chosen.** Constructor agrega `identityStorage: IdentityStorage`. El use case lee `Identity` antes del POST y extrae `codigo`.

Alternativas: (a) helper L2 separado `ResolveStudentCodeUseCase` — overkill para un getter; (b) view-model pasa el DNI por input — acopla LR a dominio.

Rationale: 4 puertos en el constructor es manejable. El use case se autocontiene. Tests del use case usan fake `IdentityStorage` que ya existe en `tests/unit/L2_application/fakes.ts`.

Edge case: `IdentityStorage.get()` retorna `null` (sesión expirada justo al apretar Enviar). El use case rechaza con `SessionExpiredError` antes de tocar el adapter. Test explícito.

### D3: `EnvioResult` reshape con `SubmissionAck` VO

**Chosen.** Nuevo VO `SubmissionAck { id: string; submissionHash: string; submittedAt: Date }`. El use case lo recibe del adapter y lo persiste vía `MarkingsStorage.setSubmissionAck`. El use case retorna `{ status: 'enviado' | 'queued', ack: SubmissionAck | null }` — ack solo en path síncrono exitoso.

Alternativas: (a) returnar fields planos en el output del use case — pero entonces home y simulacro view-models tienen que reconstruir el VO; (b) wrappear en una entidad — overkill, no tiene comportamiento.

Rationale: VO inmutable simple. Recuperable de IDB sin reconstrucción. El home view-model lo consume directo para `primaryText`/`secondaryText`. Tests con `expect(ack).toEqual(...)` directo.

### D4: `MarkingsStorage` migra `hasSubmittedAck` → `getSubmissionAck`

**Chosen.** Reemplazo del método. Firma nueva: `getSubmissionAck(examId): Promise<SubmissionAck | null>`. El callsite del home view-model migra de `=== true` a `!== null` — lectura más rica con el mismo costo computacional.

Alternativas: (a) mantener `hasSubmittedAck` Y agregar `getSubmissionAck` — duplica métodos sin razón; el booleano se deriva trivial de `!== null`. (b) mantener `hasSubmittedAck` y agregar separado `getAck` — confuso, dos getters para el mismo state.

Rationale: el booleano fue dead-code en Change 1 (siempre `false`). Reemplazarlo directo es cleanup honesto. El reshape del view-model es 1 línea.

### D5: Excepción documentada a "nunca leer `message`" — solo para enum de back

**Chosen.** El adapter `HttpExamsApi.enviar` lee `body.message` SOLO para mapear strings estructurados del enum del back: `"STUDENT_MISMATCH"`, `"STUDENT_NOT_ENROLLED"`, `"SESSION_NOT_ACTIVE"`, `"CLOCK_SKEW_BEFORE_START"`, `"CLOCK_SKEW_TOO_FAR_FUTURE"`. Cualquier otro valor de `message` se ignora y la clasificación cae al default por status.

Alternativas: (a) pedirle al back que migre a `body.code` — bloquea este change y duplica lo que el back ya emite; (b) clasificar puramente por status — colapsa 403 STUDENT_MISMATCH con 403 STUDENT_NOT_ENROLLED en el mismo error de UX (perdemos copy útil).

Rationale: la regla del CLAUDE.md ("nunca leer `message`") nació para evitar acoplamiento a texto i18n humano del back. Los valores acá son **códigos de control en mayúsculas snake_case**, no texto i18n. El back los emite explícitamente como contrato. Es una excepción **acotada y enumerada** — lista cerrada documentada en `design.md` (este doc) + spec. Si el back añade un nuevo string en el futuro, cae a `NetworkError` y aprendemos del 429/500 → forzamos el ack del nuevo enum por update del contrato.

### D6: 403 `STUDENT_MISMATCH` → branch genérico, sin clase de error

**Chosen.** No se crea `StudentMismatchError`. El adapter mapea a `NetworkError` y el view-model cae en el branch genérico `'unknown'` con redirect a `/home`.

Alternativa: crear `StudentMismatchError` solo para logging diferenciado.

Rationale: el back pide explícitamente "Error genérico, no revelar al alumno". En producción no debería pasar nunca (el JWT siempre coincide con el `code` del body emitido por la PWA). Un tipo dedicado solo aporta granularidad en telemetría, que hoy no tenemos. Si se materializa una telemetría posterior, se agrega el tipo en ese momento.

Trade-off: si nuestra PWA tiene un bug que manda otro DNI por accidente, este branch oculta el síntoma exacto. Aceptable: el bug se ve igual en logs server (el back loguea el 403), y el QA lo detecta como "envío falla en alumno X".

### D7: `StudentNotEnrolledError` SÍ se crea (UX diferenciada)

**Chosen.** Nuevo error class en L1. Copy de UI: "No estás inscripto en este examen". View-model navega a `/home` con un `errorState` propio.

Alternativa: caer en branch genérico `'unknown'`.

Rationale: caso real (alumno cambia de aula, tutor lo saca de la inscripción entre la lista y el envío). UX informativa ayuda al alumno a entender qué pasa. No interrumpe el flujo de otros exámenes — solo este queda bloqueado.

### D8: 409 `SESSION_NOT_ACTIVE` → reusa `SimulacroCerradoError`

**Chosen.** El adapter mapea 409 + `message === "SESSION_NOT_ACTIVE"` a `SimulacroCerradoError`. El view-model ya tiene branch `'cerrado'` con redirect a `/home`.

Alternativa: nuevo `SessionNotActiveError` distinguiendo "no comenzó" vs "ya cerró" vs "archivado".

Rationale: para el alumno la UX es la misma — "no podés entrar ahora". El detalle interno del lifecycle (scheduled/finalized/archived) no aporta acción. Reusar el path existente reduce código y mantiene UX consistente.

### D9: 422 `CLOCK_SKEW_*` (BEFORE_START y TOO_FAR_FUTURE) → reusan `InvalidSubmissionTimeError`

**Chosen.** Ambos valores del enum mapean al mismo error class. Copy de UI: "Tu reloj está desincronizado".

Alternativa: dos clases separadas o un campo `direction: 'before' | 'after'` en `InvalidSubmissionTimeError`.

Rationale: el alumno hace la misma acción en ambos casos (sincronizar reloj o reiniciar device). No le sirve saber la dirección. Mantener una clase es más limpio.

### D10: Excepción documentada para clasificación por `message` — solo valores enumerados

Ver D5. La regla "clasificar por `(status, endpoint, code)`" sigue siendo el default; `message` es excepción acotada y enumerada para este endpoint específico. Tabla completa de clasificación en `specs/http-client/spec.md`.

### D11: Modal de comprobante — componente standalone, presentación delegada al view-model de `/simulacro`

**Chosen.** Nuevo componente `<app-submission-receipt-modal>` standalone, con `@Input() ack: SubmissionAck` y `@Output() close = new EventEmitter<void>()`. El template del page de `/simulacro` lo renderiza condicional según `vm.lastAck() !== null`. Al hacer dismiss el view-model resetea `lastAck` y navega a `/home`.

Alternativas: (a) modal global de app (e.g., en `app.html`) — necesita un sistema de overlays que no existe; (b) page-level wrapper component — innecesariamente acoplado.

Rationale: standalone, focalizado, reusable si en el futuro queremos ver el comprobante desde otro lado. Cero infraestructura nueva. Mismo patrón que `<app-update-confirm-modal>` que ya existe.

### D12: Modal NO aparece si el queue se procesó en background (alumno en /home o app cerrada)

**Chosen.** El use case `RetomarEnviosPendientesUseCase` persiste el ack pero NO dispara modal. El modal solo aparece cuando el view-model de `/simulacro` tiene `lastAck() !== null` Y el alumno está en esa página. Si el queue se procesa en background, la card de `/home` cambia silenciosamente a "Enviado" (reactivamente vía el getSubmissionAck en composeEstado).

Alternativas: (a) modal global popup desde el dispatcher — interrumpe random; (b) push notification — overkill, requiere permisos.

Rationale: respeta el contexto del alumno. Si está mirando otra cosa, no lo interrumpas con un modal popup. La card cambiando ya es feedback visual claro. El ack se persiste igual; el alumno lo puede ver en una pantalla futura de "ver comprobante" (change posterior).

### D13: Banner queued — informativo puro, sin botón manual de reintentar

**Chosen.** El banner amarillo en `/simulacro` durante el estado `queued` muestra "Sin conexión. Tus respuestas se enviarán automáticamente cuando vuelva la red." Sin botón "Reintentar ahora".

Alternativas: agregar el botón (mi recomendación inicial) — descartada en checkpoint.

Rationale: confianza total en `EnvioRetryDispatcher` (ya cableado desde Fase 2 contra `Connectivity.isOnline`). Menos código, UX más limpia, el alumno entiende "pendiente, no hagas nada".

Riesgo conocido: en 3G débil intermitente, el evento `online` del browser puede no disparar aunque la red vuelva intermitentemente. Mitigación implícita: el dispatcher también corre al arrancar la app, así que el siguiente refresco/restart resuelve. Aceptado por el usuario.

### D14: Hash visible — bloque 4×4×4 (4 líneas × 4 grupos × 4 chars)

**Chosen.** El sha256 hex de 64 chars se renderiza dividido en 4 líneas, cada una con 4 grupos de 4 chars separados por espacios. Total visual: bloque cuadrado tipográficamente monoespaciado.

Ejemplo:
```
a3f5 c8d1 b2e4 f6a8
c9d0 e1f2 a3b4 c5d6
e7f8 a9b0 c1d2 e3f4
a5b6 c7d8 e9f0 a1b2
```

Alternativas: (a) primeros 8 chars truncados — pierde verificabilidad; (b) hash completo en una línea — overflow horizontal; (c) bloques de 8 chars en 8 líneas — alto, descompone el bloque cuadrado.

Rationale: 4×4×4 da un cuadrado visualmente atractivo, dictable por teléfono, copiable. Los espacios cada 4 chars son convención de la industria para hashes/claves largas.

### D15: Cleanup completo de `SubmissionNotAvailableError`

**Chosen.** Eliminar la clase L1, su test, y todas las referencias en use case y view-model. No mantener como dead code "por las dudas".

Alternativa: dejar la clase comentada o como TODO.

Rationale: la clase existió solo para impedir enqueue infinito del stub. Con el stub eliminado, no tiene razón de ser. Cleanup honesto. Si en el futuro hace falta un error similar para otro stub, se crea fresh con su semántica.

## Risks / Trade-offs

- **Ramas dead-code "enviado" se activan por primera vez**: en `fase-3-exam-list-learnex` las ramas `submitted` del card-state nunca corrieron en runtime (solo en tests con mock). Ahora se ejecutan. Mitigación: smoke manual en G5 con un envío real antes del merge; tests del view-model cubren ambas ramas vivas.
- **Excepción a la regla "nunca message"**: si el back agrega un nuevo enum string sin avisar, lo tratamos como `NetworkError` por default y aprendemos del 429-style retry. Mitigación: documentación explícita del set de strings aceptados en el spec; PR review de back/front coordinada cuando cambie el contrato.
- **Idempotencia con payload distinto**: alumno toca Enviar con `{P1:A}`, falla red, recupera, cambia a `{P1:B}`, dispatcher reintenta con el payload del primer intento (que está encolado), server retorna 201 con hash de `{P1:A}`. Resultado: el comprobante guardado matchea el primer envío. Mitigación: el queue persiste el `responses` original al momento del primer intento. Esto ya es así desde Fase 2.
- **Modal queue mientras está en /simulacro**: el view-model debe observar el ack reactivamente. Mitigación: signal `lastAck` se setea cuando el use case retorna con ack (path síncrono) o cuando el dispatcher invoca un callback global (path queue). Detalle de wiring en commits 5/6.
- **`IdentityStorage` null entre el GET y el POST**: caso raro pero posible. Mitigación: el use case lo verifica y rechaza con `SessionExpiredError`; view-model redirige a `/login`.
- **Migración del campo del puerto `MarkingsStorage`**: el método `hasSubmittedAck` se elimina; cualquier callsite que lo use debe migrar. Mitigación: grep en commit 6 confirma cero referencias residuales.

## Migration plan

Orden de commits:

1. **Commit 1 — `feat(L1)`**: VO `SubmissionAck`, reshape `EnvioRequest`/`EnvioResult`, `StudentNotEnrolledError` nuevo, `SubmissionNotAvailableError` eliminado, port `MarkingsStorage` migra `hasSubmittedAck` → `getSubmissionAck` + `setSubmissionAck`. Compila aislado.
2. **Commit 2 — `feat(L2)`**: `EnviarSimulacroUseCase` inyecta `IdentityStorage` + lee DNI + reshape de keys (`AnswersMap` → `responses` con prefijo `P`) + filtra `null` + persiste ack + retorna ack. `RetomarEnviosPendientesUseCase` persiste ack tras éxito. Depende de L1.
3. **Commit 3 — `feat(L3)`**: `HttpExamsApi.enviar` POST real + helper `apiPath.studentExamSubmit` + clasificación de errores por `(status, message)`. Depende de L1/L2.
4. **Commit 4 — `feat(L3)`**: `IndexedDbMarkingsStorage` implementa `setSubmissionAck`/`getSubmissionAck` con clave `cartilla.<email>.ack.<examId>`; `wipeUserScope` extiende. Depende de L1.
5. **Commit 5 — `feat(LR)`**: `<app-submission-receipt-modal>` standalone + `simulacro.view-model` integra `lastAck` y muestra modal + `home.view-model` migra a `getSubmissionAck` + copy "Pendiente de calificación". Depende de L2/L3. **Delegar a `frontend-builder`.**
6. **Commit 6 — `chore(LR)`**: copy banner queued + cleanup de `SubmissionNotAvailableError` en view-models (eliminar branch). Depende de L1.
7. **Commit 7 — `test`**: specs nuevos L1/L2/L3/LR. **Delegar a `test-engineer`.** Puede dividirse en 7a/7b si excede 8 archivos.

**CI durante intermedios:** cada commit compila + pasa lint. Los tests pueden quebrar entre 1 y 6; merge solo cuando commit 7 esté verde y `hexagonal-guard` haya auditado.

**Sin migración de datos IDB:** las marcaciones existentes (`cartilla.<email>.simulacro.<examId>`) no se tocan. El nuevo namespace `cartilla.<email>.ack.<examId>` es aditivo y empieza vacío.

## Open questions

Ninguna — el alcance quedó cerrado en checkpoint con el usuario (4 decisiones Q1–Q4 + comportamientos de modal, reconexión, banner).

## Riesgos abiertos para changes futuros

Identificados durante el design de este change. Ninguno bloquea esta entrega.

### R1 — Telemetría server-side de versión PWA postergada

El back postergó el tracking de versión PWA. Cuando se quiera reactivar, hay dos caminos: (a) header custom `X-Pwa-Version` desde el `credentials.interceptor` (Fetch Spec permite headers `X-*`, ~3 líneas de código); (b) campo en el body del POST. Coordinar nombre exacto con back antes.

### R2 — Backoff exponencial in-flight para 429/500

Hoy el reintento es on-reconnect (cuando `Connectivity.isOnline` cambia). No hay backoff in-flight. Caso edge: 40 alumnos en aula envían simultáneo al cierre, server tira 429. La PWA encola y reintenta on-reconnect, pero el reconnect no cambia (no hubo desconexión). Resultado: queue se queda esperando. Mitigación temporal: el dispatcher también corre al arrancar la app — el alumno cierra y reabre, sale. Mitigación real (change futuro): backoff exponencial con jitter cuando NetworkError con status 429/5xx.

### R3 — Ver comprobante histórico desde /home

Hoy el ack se persiste pero no hay UI para verlo después del modal inicial. Caso de uso: alumno quiere mostrar el hash a su tutor 3 días después. Mitigación: change futuro con pantalla de detalle del examen "enviado" en `/home`.

### R4 — SSE `examReady` no se consume

Fase 2 backend emitirá un SSE `examReady` cuando el tutor cierre el aula y se procese la calificación. La PWA actual no lo escucha. Cuando Fase 2 esté lista, change para integrar `EventSource` con manejo de reconexión y mapeo a refresco de cards.

### R5 — Múltiples pestañas / dispositivos simultáneos

Heredado de R3 en `fase-3-exam-list-learnex`. Aplicable también al envío: dos pestañas pueden disparar dos POSTs casi simultáneos. La idempotencia server-side lo cubre (segundo POST devuelve el ack del primero), pero genera ruido en logs. Mitigación: `BroadcastChannel` entre tabs — change futuro.
