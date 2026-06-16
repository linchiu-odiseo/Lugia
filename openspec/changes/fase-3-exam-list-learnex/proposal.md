# fase-3-exam-list-learnex — Proposal

- **Status:** proposed
- **Depends on:** `fase-3-login-learnex` (archived)
- **Unlocks:** `fase-3-exam-submit-learnex`

## Why

Tras el cut-over de auth a learnex, la cartilla quedó **rota en runtime**: el adapter HTTP de simulacros todavía apunta al contrato API-FAKE (DTO en español, `inicio`/`fin`, estados `programado/abierto/cerrado`). El alumno no puede listar simulacros del día ni entrar a marcar. Este change restaura el listado contra learnex (`GET /t/{slug}/student/exam-sessions`) y deja el envío como stub controlado, para luego habilitarlo en `fase-3-exam-submit-learnex`.

Se elige la vía **rename agresivo** (no minimalista): el dominio se realinea al vocabulario learnex (`Exam`, `ExamServerStatus` en inglés, `duration` en segundos, `scheduled`/`started`/`finished`). El costo (~350 referencias en tests) se asume ahora para evitar mappers ceremoniales y deuda semántica.

## What changes

**L1 dominio**
- Rename `Simulacro` → `Exam`. Reshape constructor: drop `fin`, add `duration: number` (seg ≥ 1), `course: string | null`, `type: string` (≤10), `started: Date | null`, `finished: Date | null`. `area` pasa a `string | null`. `inicio` → `scheduled`. Invariante `fin > inicio` reemplazada por `duration > 0`.
- Rename `EstadoSimulacro` → `ExamServerStatus`. Valores: `'scheduled' | 'in_progress' | 'finalized'`. `permiteEntrada()` solo true en `'in_progress'`; `esTerminal()` true en `'finalized'`.
- Rename `InvalidSimulacroError` → `InvalidExamError`.
- Rename port `SimulacrosApi` → `ExamsApi`; `ExamsListResult { exams, serverTime }`; `EnvioRequest.examId`.
- `Marcacion.simulacroId` → `examId`. `MarkingsStorage` renombra parámetro a `examId` (claves IDB internas conservan segmento `"simulacro"` como string runtime — flag para limpieza futura).
- Nuevos errores: `ExamsPermissionRevokedError` (403), `StudentNotLinkedError` (404 + `code: STUDENT_NOT_LINKED`), `SubmissionNotAvailableError` (clase independiente, **NO extiende `NetworkError`** para no caer en el enqueue infinito de `EnviarSimulacroUseCase`).

**L2 use cases**
- `obtener-simulacros-del-dia.use-case.ts` → `get-todays-exams.use-case.ts`; clase `GetTodaysExamsUseCase`.
- Propagación `simulacroId` → `examId` en `MarcarRespuestaUseCase`, `EnviarSimulacroUseCase`, `ProgramarAutoEnvioUseCase`, `RetomarEnviosPendientesUseCase` (rename puro).
- `ProgramarAutoEnvioUseCase`: timer calculado como `exam.started.getTime() + exam.duration * 1000` cuando `'in_progress'` con `started` no-null; fallback `exam.scheduled.getTime() + exam.duration * 1000`. Factor correcto **× 1000** (no × 60 000).

**L3 adapter**
- `http-simulacros-api.ts` → `http-exams-api.ts`; clase `HttpExamsApi implements ExamsApi`.
- URL vía nuevo helper `apiPath.studentExamSessions()` → `/t/{slug}/student/exam-sessions`.
- DTO learnex mapeado directo a `Exam` (sin traducción de estados, sin discriminador `finished !== null` — el "yo envié" vive en LR).
- Clasificación por `(status, endpoint, code)`: 401 lo maneja el `credentials.interceptor`; 403 → `ExamsPermissionRevokedError`; 404+`STUDENT_NOT_LINKED` → `StudentNotLinkedError`; 404 sin code → `NetworkError`; 0/5xx → `NetworkError`; 429 → `NetworkError` (diferido).
- POST `enviar`: stub síncrono que lanza `SubmissionNotAvailableError` **sin tocar HTTP**.

**LR render**
- `home.view-model.ts`: composición de estado-tarjeta (5 combinaciones server-status × flag-local "yo envié"). Flag local derivado del estado IDB existente (`MarkingsStorage` confirmado por examId). `primaryText()`/cierre usa `scheduled + duration*1000`. `secondaryText()` cae a `area ?? course ?? '—'`.
- `simulacro.view-model.ts`: temporizador `Math.max(0, exam.duration - (serverTime - exam.started)/1000)` en segundos. Guard de submit usa `ExamServerStatus.permiteEntrada()`.
- Nuevo branch UI "Tu cuenta no tiene un alumno asociado, contacta al tutor" para `StudentNotLinkedError` (Signal dedicado en home).
- `app.config.ts`: token `SIMULACROS_API` → `EXAMS_API`. URLs de ruta (`/simulacro/:id`) **no cambian** (es-PE, regla 5).

**Tests**
- Reshape de specs L1 (`exam.spec.ts`, `exam-server-status.spec.ts`) + nuevos errores.
- `tests/feature/L3_periphery/http/http-exams-api.spec.ts`: 200 (3 estados × null en course/area/started), 403, 404+code, 404 sin code, 500, 429, POST stub.
- `tests/feature/LR_render/view-models/home.view-model.spec.ts`: 5 combinaciones de card-state.
- `tests/feature/LR_render/view-models/simulacro.view-model.spec.ts`: nueva matemática del timer.

## Impact

Capabilities OpenSpec deltadas:
- `exam-list` — **MAJOR**: rename de entidad, port, estados, DTO; nuevos errores y flujos.
- `exam-submission` — **MINOR**: POST stub controlado + nueva error class; sin cambio de comportamiento offline para marcaciones.
- `auth-session` — sin cambio.
- `markings-offline-queue` — patch: rename de campo `simulacroId` → `examId` en `Marcacion` y firmas de `MarkingsStorage` (sin migración de schema IDB).

## Out of scope

- POST envío real con dos timestamps (`clientFinishedAt` + `clientSubmittedAt`) → `fase-3-exam-submit-learnex`.
- Procesar el outbox IDB contra learnex POST → Change 2.
- GET de contenido de preguntas — no aplica nunca en Lugia (papel físico).
- Historial de simulacros pasados → change futuro.
- Manejo de 429 con backoff → hardening change futuro.
- Dashboard de tutor real → change futuro.
- Migración de schema IDB (claves siguen con segmento `"simulacro"` como string runtime) → cleanup futuro.
- Rename de URL de ruta Angular (`/simulacro/:id` queda en español).

## Delivery plan

PR único, ~6–7 commits quirúrgicos (≤8 archivos c/u). Implementación canalizada por sub-agentes: `frontend-builder` (LR), `test-engineer` (tests), `hexagonal-guard` (auditoría pre-merge).

1. `feat(L1): rename Simulacro→Exam, reshape entity + EstadoSimulacro→ExamServerStatus` (~7 archivos: entidad, VO, errores, port, `Marcacion`, `MarkingsStorage`, índices).
2. `feat(L1): add ExamsPermissionRevokedError, StudentNotLinkedError, SubmissionNotAvailableError` (~4 archivos).
3. `feat(L2): rename use cases + propagate examId + fix duration math (×1000)` (~6 archivos).
4. `feat(L3): http-exams-api adapter + apiPath.studentExamSessions + POST stub` (~5 archivos).
5. `feat(LR): home/simulacro view-models card-state + timer + StudentNotLinked branch` (~6 archivos).
6. `chore(infra): rename DI token SIMULACROS_API→EXAMS_API + app.config wiring` (~3 archivos).
7. `test: reshape L1/L2/L3/LR specs to Exam vocabulary (mechanical + targeted rewrites)` (~8 archivos por sub-PR interno; el commit final consolida, pudiendo dividirse en 7a/7b si excede 8 archivos).

## Risks and mitigations

- **429 en IP de aula** (40 alumnos × 3 req/min ≈ 120/min > 60/min): **diferido**. Tratado como `NetworkError` en este change. Documentado en `design.md` como riesgo conocido; mitigación (backoff + jitter o token-bucket cliente) en change futuro.
- **`SubmissionNotAvailableError` heredando `NetworkError`** llevaría a enqueue infinito en `EnviarSimulacroUseCase`. Mitigación: clase **independiente** (no extiende `NetworkError`); test explícito en L3.
- **`area: null` aceptado en entidad** (riesgo de UI vacía). Mitigación: el fallback `area ?? course ?? '—'` es UI-only (no contamina dominio).
- **~350 referencias en tests a renombrar.** Mitigación: delegar a `test-engineer` con pasada mecánica `Simulacro→Exam` + reescrituras puntuales donde cambia el shape (constructor, estados). Commit 7 puede dividirse para no romper la regla de ≤8 archivos.
- **Cartilla rota durante el rename** entre commits L1 y LR. Mitigación: PR único; merge solo cuando los 7 commits están verdes en CI; `hexagonal-guard` audita antes del merge.

## Open questions

Ninguna — el alcance quedó cerrado en el checkpoint con el usuario.
