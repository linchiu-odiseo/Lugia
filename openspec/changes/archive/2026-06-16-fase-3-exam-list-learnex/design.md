# fase-3-exam-list-learnex — Design

## Context

Este change es el segundo escalón de Fase 3. El anterior (`fase-3-login-learnex`, archivado el 2026-06-12) cerró el cut-over de auth: cookies HttpOnly + `withCredentials: true` vía `credentials.interceptor`, refresh reactivo con lock `shareReplay(1)`, clasificación HTTP por `(status, endpoint, code)`. Eso dejó **la cartilla rota en runtime**: el adapter de simulacros sigue apuntando al contrato API-FAKE (DTO en español, `inicio`/`fin`, estados `programado/abierto/cerrado`), por lo que `/home` no puede listar exámenes ni habilitar entrada al marcado.

Este change restaura el listado contra learnex (`GET /t/{slug}/student/exam-sessions`) y **deja el POST de envío como stub controlado** — el contrato completo de envío (dos timestamps, idempotencia, manejo de 400 `INVALID_TIME` / 403 `CLOSED` / 404 / 401) se cierra en el siguiente change, `fase-3-exam-submit-learnex`. El POST stub lanza `SubmissionNotAvailableError` síncronamente, sin tocar HTTP, para no contaminar el outbox IDB.

La decisión del usuario en el checkpoint fue **rename agresivo, no minimalista**: el dominio se realinea al vocabulario learnex (`Exam`, `ExamServerStatus` en inglés, `duration` en segundos, `scheduled`/`started`/`finished`), aceptando ~350 referencias de tests a reescribir. La justificación es evitar mappers ceremoniales y deuda semántica durante el resto de Fase 3.

## Goals / Non-goals

**Goals**
- Restaurar `/home` consumiendo learnex GET de sesiones del día (lista + serverTime).
- Realinear el dominio (`Exam`, `ExamServerStatus`, `duration` segundos) al contrato learnex.
- Aislar el POST de envío como stub independiente de `NetworkError` para no envenenar el outbox IDB.
- Componer el estado-tarjeta de 5 combinaciones (`serverStatus × yaEnvie`) puramente en LR.
- Mantener intacto el comportamiento offline-first de marcaciones (solo rename de campo `simulacroId → examId`).

**Non-goals**
- POST real con `clientFinishedAt` + `clientSubmittedAt` (→ Change 2).
- Procesar outbox IDB contra POST real (→ Change 2).
- Migración de schema IDB — las claves siguen con segmento literal `"simulacro"` runtime.
- Backoff/jitter para 429 (diferido a hardening futuro).
- Rename de URL de ruta Angular (`/simulacro/:id` queda en es-PE por regla 5).
- Dashboard tutor real, historial pasado.

## Decisions

### D1: Rename agresivo en L1 (Simulacro → Exam, EstadoSimulacro → ExamServerStatus, valores en inglés)

**Chosen.** Entidad `Exam`, VO `ExamServerStatus` con `'scheduled' | 'in_progress' | 'finalized'`, error `InvalidExamError`, port `ExamsApi`.

Alternativas: (a) rename minimalista — solo adapter, mantener `Simulacro` en dominio con mapper en L3; (b) bilingüe — dejar nombres en español, traducir valores.

Rationale: una sola superficie semántica para el resto de Fase 3. Los mappers ceremoniales son antipattern (`hexagonal-guard` los marca). El costo (~350 referencias en tests) se delega mecánicamente a `test-engineer`.

### D2: `fin` removido, `duration: number` (segundos) introducido — factor ×1000

**Chosen.** Constructor de `Exam` exige `duration ≥ 1` (segundos). Cómputo de cierre: `scheduled.getTime() + duration * 1000` en view-models y `ProgramarAutoEnvioUseCase`.

Alternativa: mantener `fin: Date` y derivar duración. Rechazada: el DTO learnex envía `duration`, no `fin`; la invariante `fin > inicio` ya no aplica.

Rationale: alineación literal con learnex. El factor ×1000 (NO ×60000) se documenta como invariante: `duration` es **segundos**, no minutos.

### D3: `started: null` con `serverStatus === 'in_progress'` → incluir + alerta en LR (entrar + banner)

**Chosen (revisado el 2026-06-16 post-uso real contra learnex).** El adapter **NO filtra** items con `status: 'in_progress' && started: null`. Los pasa al dominio. El view-model de `/simulacro/:id` los trata como cualquier otro `in_progress` con `started` no vigente: se muestra el banner amarillo "☕ El examen está tomando un café, ¡espera la señal para empezar!" y el botón Enviar queda deshabilitado hasta que `hasStartedBy(now)` sea true.

Alternativas históricas: (A) `InvalidExamError` all-or-nothing — rechaza la lista entera por un dato raro; (B, planteada inicialmente) skip silencioso con `console.warn` — el alumno no ve el examen; (C) coerción `started = scheduled` — enmascara.

Rationale (revisión 2026-06-16): el alumno **necesita ver todos los exámenes que el GET trae**. Aunque `started: null + in_progress` sea raro y en producción no debería ocurrir (el back valida la consistencia), durante desarrollo el dba puede editar la BD a mano y los datos no consistentes deben mostrarse igual con la UX de "no vigente todavía", no esconderse. La PWA pasa de "filtrar para que no se note" a "aceptar y comunicar". El usuario lo expresó así: "la cartilla tenía un mensaje amarillo que decía 'puedes marcar por mientras se guardarán en IDB'".

Implementación: el adapter mapea el DTO 1:1 a `Exam`. `Exam.hasStartedBy(null)` retorna `false`, lo que activa `examenNoIniciado` en el view-model y dispara banner + Enviar disabled.

Casos NO cubiertos por esta resiliencia: shapes que rompen invariantes duras del dominio (`count <= 0`, `duration <= 0`, fechas no ISO8601, `serverStatus` fuera del set permitido) siguen propagando `InvalidExamError`. Solo `started: null + in_progress` se acepta — es el único caso "semánticamente raro pero no inválido" que el dominio puede modelar bien.

### D4: `yaEnvie` derivado de nuevo método `MarkingsStorage.hasSubmittedAck(examId)`

**Chosen (Option A del checkpoint).** Crecimiento puro del port `MarkingsStorage`. Firma: `hasSubmittedAck(examId: string): Promise<boolean>`.

Alternativas: (B) inferir de ausencia en `getEnviosPendientes()` + presencia local — brittle; (C) VO nuevo `EnvioConfirmacion` en object store dedicado — overkill.

Rationale: contrato limpio, fácil de fakear en tests. **En Change 1, el método SIEMPRE retorna `false`** (POST stub nunca confirma ack), por lo que la matriz de 5 estados colapsa a 3 vivos: `pending` / `open` / `closed`. Las ramas `submitted` (in_progress + ack, finalized + ack) quedan **dead code intencional** hasta Change 2. Documentar el seam en código.

### D5: DI token `SIMULACROS_API → EXAMS_API` se renombra en commit 6 (chore infra)

**Chosen (Option A del checkpoint).** El commit 6 (`chore(infra)`) reúne `app.config.ts` wiring + token rename. Commits 1–5 quedan enfocados en domain/application/adapter/UI sin ruido de DI.

Alternativa: renombrar el token en commit 1 con la entidad. Rechazada: mezcla rename de dominio con rewire de DI.

Rationale: el token es contrato compile-time. Los tests usan `TestBed.providers` con la referencia importada, así que el cambio se propaga por errores de compilación mecánicos.

### D6: `SubmissionNotAvailableError` NO extiende `NetworkError`

**Chosen.** Clase independiente en L1, hereda directo de `Error`.

Rationale: `EnviarSimulacroUseCase` captura `NetworkError` para encolar en IDB. Si `SubmissionNotAvailableError` heredara `NetworkError`, cada tap a "Enviar" durante Change 1 acumularía una entrada en el outbox indefinidamente. Test explícito en L3: `expect(err instanceof NetworkError).toBe(false)`.

### D7: `area: null` aceptado por la entidad; fallback en view-model

**Chosen.** Constructor de `Exam` acepta `area: string | null` directo. El view-model usa `area ?? course ?? '—'` solo para display.

Alternativa: forzar `area` non-null en entidad con default `''`. Rechazada: contamina dominio con concern de presentación.

Rationale: dominio honesto al contrato; UI maneja el fallback.

### D8: Disambiguación `enviado` vs `cerrado` se compone en LR, no en L3

**Chosen.** El adapter mapea 1:1 `serverStatus` DTO → entidad. La rama `submitted` vs `closed` se decide en el view-model con `serverStatus + hasSubmittedAck(examId)`.

Rationale: el campo `finished` del DTO es "ventana global cerrada", NO "este alumno envió". El adapter no tiene acceso a la señal local de IDB, así que la decisión vive necesariamente en LR.

### D9: 429 tratado como `NetworkError` en Change 1 (sin backoff)

**Chosen.** Diferido. El adapter mapea 429 → `NetworkError` sin distinción especial.

Cálculo de carga: 40 alumnos por aula × 3 req/min (focus + polling 120s + pull-to-refresh ocasional) ≈ **120 req/min > 60 req/min** que learnex impone por IP. Riesgo real en producción de aula.

Mitigación futura (hardening change): token-bucket cliente o backoff exponencial con jitter. No bloquea este change.

## Risks / Trade-offs

- **~350 referencias en tests a reescribir.** Mitigación: pasada mecánica `Simulacro → Exam` + reescrituras puntuales donde cambia el shape (constructor sin `fin`, valores de estado en inglés). Si el commit 7 excede 8 archivos, se divide en 7a/7b.
- **Cartilla rota entre commits intermedios** (L1 cambia antes que L3 y LR). Mitigación: PR único; merge solo cuando los 7 commits están verdes en CI; cada commit compila aislado (capas inferiores no dependen de superiores).
- **`hasSubmittedAck` es dead-true-branch en Change 1.** Reactivado en Change 2 cuando POST success persiste el ack. Seam documentado en código con TODO referenciando `fase-3-exam-submit-learnex`.
- **IDB keys retienen segmento literal `"simulacro"`.** No-op runtime (claves IDB son strings). Flag explícito para cleanup change futuro — evita migración de datos en este change.
- **`SubmissionNotAvailableError` nunca llega a producción** porque Change 2 reemplaza el stub antes del próximo release. Aceptable; existe solo para impedir el enqueue infinito durante desarrollo.
- **429 en aula real.** Riesgo conocido; tratamiento solo como `NetworkError`. Si se materializa antes del hardening change, se acelera ese trabajo.

## Migration plan

Orden de renames y commits (mapeado al delivery-plan del proposal):

1. **Commit 1 — `feat(L1)`**: rename entidad + VO + errores base. Compila aislado (L1 no depende de nadie). Tests L1 rotos hasta commit 7.
2. **Commit 2 — `feat(L1)`**: añadir `ExamsPermissionRevokedError`, `StudentNotLinkedError`, `SubmissionNotAvailableError`.
3. **Commit 3 — `feat(L2)`**: rename use cases + propagar `examId` + fix factor ×1000 en `ProgramarAutoEnvioUseCase`. Depende de L1.
4. **Commit 4 — `feat(L3)`**: `http-exams-api.ts` + `apiPath.studentExamSessions()` + POST stub. Depende de L1/L2.
5. **Commit 5 — `feat(LR)`**: home view-model (5-state matrix), simulacro view-model (timer ×1000), branch `StudentNotLinked`. Depende de L3.
6. **Commit 6 — `chore(infra)`**: token `SIMULACROS_API → EXAMS_API` + `app.config.ts` wiring. Compila el árbol completo.
7. **Commit 7 — `test`**: reshape mecánico de specs L1/L2/L3/LR. CI verde end-to-end.

**CI durante intermedios:** cada commit compila + pasa lint. Los tests no pasan hasta commit 7; el merge a master se hace solo cuando el commit final está verde. `hexagonal-guard` audita antes del merge para confirmar boundaries.

**Sin backwards compatibility window:** los renames son compile-time (TypeScript). Las claves IDB son strings runtime y NO se tocan (`Marcacion.simulacroId → examId` es solo nombre de campo, el segmento `"simulacro"` en la clave persiste). Cero migración de datos.

## Open questions

Ninguna — las tres del spec phase quedan resueltas en D3, D4, D5.

## Riesgos abiertos para changes futuros

Identificados al cerrar el change tras uso real contra learnex. Ninguno bloquea esta entrega
(la cartilla de listado funciona), pero todos son escenarios reales de producción que el
próximo change de robustez debería abordar. Se documentan acá para que `sdd-explore` los
levante al arrancar `fase-3-exam-robustness-learnex` (o similar).

### R1 — Cierre del examen mid-sesión no se detecta en `/simulacro/:id`

- **Síntoma**: el tutor cierra el examen manualmente mientras el alumno está marcando.
  El alumno NO se entera — sigue marcando hasta que aprieta Enviar (o vuelve al home y
  ve la card en `cerrado`).
- **Causa**: `SimulacroPageViewModel.start()` (`src/LR_render/view-models/simulacro.view-model.ts`)
  carga el `Exam` UNA vez del listado y no refresca. El ticker solo recalcula countdowns
  locales; no consulta al server.
- **Dirección sugerida**: agregar polling en la página de marcado (ej. 30–60s) que
  vuelva a invocar `GetTodaysExamsUseCase` y reconcilie el `Exam` actual. Si el polling
  detecta `status: 'finalized'`, redirigir al home con razón `cerrado`. Considerar SSE
  como alternativa si learnex lo soporta.

### R2 — Cambio de `started` mid-sesión no se refleja

- **Síntoma**: el tutor reinicia el examen (cambia `started` a un valor nuevo).
  La página de marcado sigue con el `started` viejo, countdown miente.
- **Causa**: misma que R1 — sin refresh durante la sesión.
- **Dirección sugerida**: el mismo polling de R1 cubre este caso. Si `exam.started`
  cambió respecto al cargado, recargar marcaciones desde IDB (las anteriores siguen
  válidas) y reiniciar el ticker contra el nuevo anchor.

### R3 — Múltiples pestañas / dispositivos simultáneos

- **Síntoma**: el alumno abre la PWA en 2 pestañas (o en celular + tablet). Cada
  instancia tiene su propio ticker y su propio `ProgramarAutoEnvioUseCase`. Al cumplirse
  `closeAt` → 2 disparos del auto-envío.
- **Causa**: cada instancia inicializa sus servicios providedIn root sin coordinación
  entre tabs. IDB sí se comparte (mismo origen), pero los timers en memoria no.
- **Riesgo real**: en Change 2 (POST real) habría 2 envíos al server. learnex idempotencia
  con 409 mitiga, pero genera ruido en logs y carga inútil.
- **Dirección sugerida**: usar `BroadcastChannel` o `localStorage` events para que la
  primera pestaña que dispare el auto-envío marque un flag en IDB; las demás chequean
  el flag antes de disparar. Alternativa: detectar `document.visibilityState === 'hidden'`
  para que solo la pestaña visible programe auto-envío.

### R4 — Service Worker cache vieja después de deploy

- **Síntoma**: deployamos un fix de marcación (ej. `vigente` guard). El alumno tiene
  la PWA abierta con la versión vieja sin el guard. Puede marcar sobre un examen cerrado.
- **Causa**: el SW (`ngsw-worker.js`) sirve assets cacheados hasta que detecta nueva
  versión y se actualiza. En `app.config.ts:77-80` está configurado con
  `registerWhenStable:30000` — el primer chequeo es tras 30s de idle. Window de skew
  variable según patrón de uso.
- **Dirección sugerida**: implementar prompt "Hay una versión nueva, recargá" cuando el
  SW detecte update (`SwUpdate.versionUpdates` Observable de Angular). Si el alumno está
  en pleno examen, ofrecer al final de la sesión, no en medio. Considerar también
  `skipWaiting` para emergencias críticas con flag de feature.

### Riesgos secundarios (menor prioridad)

- **`OfflineStorageUnavailableError` durante marcado** (mid-examen): el precheck del home
  ya lo detecta al cargar, pero IDB puede fallar después (Safari privado, cuota llena).
  Hoy el error propaga sin manejo en `MarcarRespuestaUseCase`. **Sugerencia**: agregar
  banner naranja "Storage local no disponible, las marcas no se guardarán" + opción de
  reintentar.
- **Server envía `count: 0` o `duration: 0`**: el constructor de `Exam` lanza
  `InvalidExamError` y toda la lista falla porque el adapter no skipea items inválidos.
  **Sugerencia**: filtrar items con `count >= 1 && duration >= 1` en el adapter con
  `console.warn`, similar al patrón del skip silencioso que estuvimos discutiendo.
- **Reloj cliente significativamente desfasado**: `ServerAnchoredClock` corrige al recibir
  `serverTime`, pero entre GETs puede divergir varios segundos. No es vector de cheating
  (server valida `clientFinishedAt` en POST), pero sí afecta countdowns visuales.
  **Sugerencia**: aceptar; documentar como límite conocido.
- **Ramas dead-code `enviado` (hasSubmittedAck=true)**: en Change 1 nunca se ejecutan
  en runtime, solo en tests con mocks. Al aterrizar Change 2 podría haber bugs latentes.
  **Sugerencia**: en `fase-3-exam-submit-learnex`, antes de habilitar el POST real,
  forzar `hasSubmittedAck=true` en un examen de prueba y verificar manualmente los
  estados visuales.
