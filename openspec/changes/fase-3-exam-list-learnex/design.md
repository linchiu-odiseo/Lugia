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

### D3: `started: null` con `serverStatus === 'in_progress'` → skip silencioso con `console.warn` (resiliencia)

**Chosen (Option B, decisión del usuario tras checkpoint).** El adapter detecta el item malformado, emite `console.warn('[ExamsApi] Skipping malformed exam', { id, reason })` y lo **excluye de la lista resultante**. Los exámenes válidos se muestran normalmente.

Alternativas: (A) `InvalidExamError` all-or-nothing — rechazada por el usuario porque deja al alumno sin lista por un bug del back; (C) coerción `started = scheduled` — rechazada por enmascarar datos rotos.

Rationale (del usuario): "el back se encarga de no enviar así; si llega a mandar así, que la PWA lo acepte y resista". La PWA debe ser **resiliente** ante datos imposibles que learnex nunca debería mandar. El `console.warn` deja rastro para debugging en dev tools; no se reporta a error-tracking porque no existe pipeline. Si el back empieza a emitir items malformados sistemáticamente, se detecta inspeccionando consola — no por banner al alumno.

Condición exacta del skip (solo este caso, no otros): `dto.status === 'in_progress' && dto.started === null`. Otros shapes inválidos (ej. `count <= 0`, `duration <= 0`) siguen rechazándose por el constructor de `Exam` y propagan como `InvalidExamError` global; el adapter solo absorbe la combinación started-null + in_progress.

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
