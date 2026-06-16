# Delta for exam-list

## MODIFIED Requirements

### Requirement: Obtener simulacros del día desde el backend

El sistema SHALL exponer `GetTodaysExamsUseCase` (L2) que invoca el puerto `ExamsApi` (L1) y devuelve una lista de entidades `Exam` correspondientes al alumno autenticado, junto con el `serverTime` ISO 8601 reportado por el backend. La operación reside en L2 y depende del puerto `ExamsApi`.
(Previously: use case named `ObtenerSimulacrosDelDiaUseCase`, port named `SimulacrosApi`, entity named `Simulacro`.)

El adapter SHALL llamar `GET /t/{slug}/student/exam-sessions` construida via `apiPath.studentExamSessions()`. Auth via cookies HttpOnly + `withCredentials: true` — gestionado por `credentials.interceptor`; el adapter no agrega headers de auth. El server ordena por `scheduled DESC`; el cliente NO reordena la lista. La lista MAY ser vacía.

La entidad `Exam` (L1) SHALL tener los campos: `id`, `area: string | null`, `course: string | null`, `type: string`, `name: string`, `count: number`, `duration: number` (segundos, ≥ 1), `serverStatus: ExamServerStatus`, `scheduled: Date`, `started: Date | null`, `finished: Date | null`.

`ExamServerStatus` SHALL admitir solo los valores `'scheduled' | 'in_progress' | 'finalized'`. El método `permiteEntrada()` MUST retornar `true` solo cuando el valor es `'in_progress'`. El método `esTerminal()` MUST retornar `true` cuando el valor es `'finalized'`.

Clasificación de errores por `(status, endpoint, body.code)` — NUNCA por `message`:
- 401 → manejado por `credentials.interceptor` (refresh + redirect login si falla). El adapter NO clasifica.
- 403 → `ExamsPermissionRevokedError`.
- 404 con `code: "STUDENT_NOT_LINKED"` → `StudentNotLinkedError`.
- 404 sin ese code → `NetworkError`.
- 0 / 5xx → `NetworkError`.
- 429 → `NetworkError` (manejo de backoff diferido a change futuro).

(Rest of this delta spec matches the merged version in main specs.)

## REMOVED Requirements

### Requirement: Modelo de 4 estados del simulacro

(Reason: reemplazado por la composición de 5 estados en `Requirement: Composición de estado-tarjeta en el view-model`. El estado ya no viene del backend como campo discreto `estado`; se deriva de `serverStatus × yaEnvie` en el view-model LR. La entidad `Exam` solo expone `serverStatus: ExamServerStatus`. Los valores `pendiente/abierto/enviado/cerrado` en español quedan reemplazados por `pending/open/submitted/closed` como estado de tarjeta UI.)
