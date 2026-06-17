# Delta for exam-submission

## ADDED Requirements

### Requirement: SubmissionAck VO en L1

La capa L1 SHALL exponer el value-object `SubmissionAck` con campos readonly `id: string`, `submissionHash: string` (64 chars hex), `submittedAt: Date`. El constructor valida: `id` no vacío; `submissionHash` matchea `/^[0-9a-f]{64}$/`; `submittedAt` es `Date` válido. Sirve como comprobante criptográfico devuelto por el server tras un envío exitoso.

#### Scenario: SubmissionAck válido

- **GIVEN** parámetros `id="7620c18d-...", submissionHash="a3f5...a1b2" (64 hex), submittedAt=Date válido`
- **WHEN** se construye `new SubmissionAck(...)`
- **THEN** la instancia expone los campos sin transformación

#### Scenario: SubmissionAck rechaza hash inválido

- **WHEN** se construye con `submissionHash="abc"` (no es 64 hex chars)
- **THEN** lanza Error con mensaje descriptivo

### Requirement: ExamsApi.enviar contrato real

El puerto `ExamsApi.enviar(req: EnvioRequest): Promise<EnvioResult>` SHALL recibir `EnvioRequest = { examId: string; code: string; responses: Record<string, 'A'|'B'|'C'|'D'|'E'>; clientFinishedAt: string }` y SHALL retornar `EnvioResult = { ack: SubmissionAck }`. El stub `SubmissionNotAvailableError` SHALL NOT existir.

#### Scenario: Envío exitoso retorna ack

- **WHEN** el adapter recibe HTTP 201 con body `{ id, submission_hash, submitted_at }`
- **THEN** `enviar()` resuelve con `{ ack: SubmissionAck }` con esos campos parseados

### Requirement: EnviarSimulacroUseCase inyecta IdentityStorage

El use case `EnviarSimulacroUseCase` SHALL inyectar `IdentityStorage` como cuarto puerto. En `execute()` SHALL leer la identidad antes del POST y extraer `codigo` para construir `EnvioRequest.code`. Si `IdentityStorage.get()` retorna `null` o `identity.codigo` es `null`, SHALL lanzar `SessionExpiredError` sin tocar el adapter.

#### Scenario: Use case resuelve DNI internamente

- **GIVEN** IdentityStorage retorna `Identity` con `codigo="30303011"`
- **WHEN** se invoca `EnviarSimulacroUseCase.execute({ examId })`
- **THEN** el adapter recibe `EnvioRequest` con `code: "30303011"`

#### Scenario: Sesión expirada durante envío

- **GIVEN** `IdentityStorage.get()` resuelve a `null`
- **WHEN** se invoca `execute()`
- **THEN** lanza `SessionExpiredError`
- **AND** `ExamsApi.enviar` NUNCA es invocado

### Requirement: Reshape de responses con prefijo P y filtro de null

El use case `EnviarSimulacroUseCase` SHALL transformar el `AnswersMap` interno (`{ "1": "C", "2": null, "3": "A" }`) en `responses` con keys con prefijo `"P"` y SHALL omitir las preguntas con valor `null`. Esto cumple el contrato learnex donde solo se envían las respuestas marcadas.

#### Scenario: AnswersMap con nulls produce responses filtrado

- **GIVEN** `AnswersMap = { "1": "A", "2": null, "5": "D" }`
- **WHEN** el use case construye el body para el adapter
- **THEN** `responses = { "P1": "A", "P5": "D" }`
- **AND** la key `"P2"` NO está presente

#### Scenario: AnswersMap vacío produce responses vacío

- **GIVEN** `AnswersMap = { "1": null, "2": null, "3": null }`
- **WHEN** el use case construye el body
- **THEN** `responses = {}` (entrega en blanco válida según contrato)

### Requirement: Envío exitoso persiste ack y limpia marcaciones

Cuando `ExamsApi.enviar` resuelve con `{ ack }`, el use case `EnviarSimulacroUseCase` SHALL:
1. Persistir el ack via `MarkingsStorage.setSubmissionAck(examId, ack)`.
2. Borrar las marcaciones locales via `MarkingsStorage.clearMarcaciones(examId)`.
3. Retornar `{ status: 'enviado', ack }`.

#### Scenario: Persistencia y limpieza tras 201

- **GIVEN** `api.enviar` retorna `{ ack: validAck }`
- **WHEN** el use case procesa el éxito
- **THEN** `storage.setSubmissionAck(examId, validAck)` es invocado UNA vez
- **AND** `storage.clearMarcaciones(examId)` es invocado UNA vez
- **AND** el output del use case es `{ status: 'enviado', ack: validAck }`

### Requirement: NetworkError encola payload completo

Cuando `ExamsApi.enviar` rechaza con `NetworkError`, el use case `EnviarSimulacroUseCase` SHALL encolar el envío en `MarkingsStorage.enqueueEnvio` con el `code`, `responses`, `clientFinishedAt` y `examId` originales. SHALL retornar `{ status: 'queued', ack: null }`. SHALL NO persistir ack.

#### Scenario: NetworkError → queued con payload completo

- **GIVEN** `api.enviar` rechaza con `new NetworkError()`
- **WHEN** el use case procesa el error
- **THEN** `storage.enqueueEnvio` recibe `{ examId, code, responses, clientFinishedAt }`
- **AND** el output es `{ status: 'queued', ack: null }`
- **AND** `setSubmissionAck` NO es invocado

### Requirement: Queue retry persiste ack

El use case `RetomarEnviosPendientesUseCase` SHALL, tras un éxito 201 del retry, persistir el ack via `MarkingsStorage.setSubmissionAck` ANTES de hacer `dequeueEnvio` + `clearMarcaciones`. Esto garantiza que el comprobante esté disponible cuando el alumno reabra la app.

#### Scenario: Queue replay exitoso persiste ack y dequeue

- **GIVEN** hay 1 envío en la cola y `api.enviar` retorna `{ ack }`
- **WHEN** `RetomarEnviosPendientesUseCase.execute()` procesa la cola
- **THEN** `storage.setSubmissionAck` es invocado con el `examId` y el `ack`
- **AND** `storage.dequeueEnvio(examId)` es invocado después
- **AND** `storage.clearMarcaciones(examId)` es invocado

### Requirement: Mapeo de 403 STUDENT_NOT_ENROLLED → StudentNotEnrolledError

El adapter `HttpExamsApi.enviar` SHALL clasificar HTTP 403 con `body.message === "STUDENT_NOT_ENROLLED"` como `StudentNotEnrolledError`. El view-model trata este error mostrando copy "No estás inscripto en este examen" y redirige a `/home`.

#### Scenario: 403 STUDENT_NOT_ENROLLED

- **WHEN** el back responde 403 con `body: { message: "STUDENT_NOT_ENROLLED" }`
- **THEN** `enviar()` rechaza con `StudentNotEnrolledError`

#### Scenario: 403 STUDENT_MISMATCH cae a NetworkError genérico

- **WHEN** el back responde 403 con `body: { message: "STUDENT_MISMATCH" }`
- **THEN** `enviar()` rechaza con `NetworkError` (sin clase dedicada)
- **AND** el view-model lo trata como error desconocido y redirige a `/home`

#### Scenario: 409 SESSION_NOT_ACTIVE reusa SimulacroCerradoError

- **WHEN** el back responde 409 con `body: { message: "SESSION_NOT_ACTIVE" }`
- **THEN** `enviar()` rechaza con `SimulacroCerradoError`

#### Scenario: 422 CLOCK_SKEW_BEFORE_START reusa InvalidSubmissionTimeError

- **WHEN** el back responde 422 con `body: { message: "CLOCK_SKEW_BEFORE_START" }`
- **THEN** `enviar()` rechaza con `InvalidSubmissionTimeError`

#### Scenario: 422 CLOCK_SKEW_TOO_FAR_FUTURE reusa InvalidSubmissionTimeError

- **WHEN** el back responde 422 con `body: { message: "CLOCK_SKEW_TOO_FAR_FUTURE" }`
- **THEN** `enviar()` rechaza con `InvalidSubmissionTimeError`

#### Scenario: 400 cualquier message → InvalidPayloadError

- **WHEN** el back responde 400
- **THEN** `enviar()` rechaza con `InvalidPayloadError` (sin leer message)

#### Scenario: 404 → SimulacroNoAsignadoError

- **WHEN** el back responde 404
- **THEN** `enviar()` rechaza con `SimulacroNoAsignadoError`

#### Scenario: 429 → NetworkError

- **WHEN** el back responde 429
- **THEN** `enviar()` rechaza con `NetworkError`

#### Scenario: 5xx → NetworkError

- **WHEN** el back responde 500
- **THEN** `enviar()` rechaza con `NetworkError`

### Requirement: Cleanup de SubmissionNotAvailableError

La clase `SubmissionNotAvailableError` SHALL ser eliminada de L1 (archivo borrado). Toda referencia en L2 (`EnviarSimulacroUseCase.execute` catch branch), LR (view-model `handleSubmissionError`, imports) SHALL eliminarse. `grep -r "SubmissionNotAvailableError" src/` SHALL devolver cero matches.

#### Scenario: Grep limpio

- **WHEN** se ejecuta `grep -r "SubmissionNotAvailableError" src/`
- **THEN** el comando retorna 0 matches

## MODIFIED Requirements

### Requirement: POST envío real con contrato learnex

El método `ExamsApi.enviar` en el adapter `HttpExamsApi` SHALL emitir HTTP POST a `apiPath.studentExamSubmit(req.examId)` con `withCredentials: true` (heredado del interceptor) y body `{ code, responses, client_finished_at }` (snake_case). Al recibir 201 SHALL mapear `{ id, submission_hash, submitted_at }` a `SubmissionAck` y retornar `{ ack }`.
(Previously: era stub síncrono que lanzaba `SubmissionNotAvailableError` sin tocar HTTP.)

#### Scenario: URL armada con apiPath.studentExamSubmit y examId

- **GIVEN** `EnvioRequest = { examId: "7620c18d-..." }`
- **WHEN** `enviar()` emite el POST
- **THEN** la URL es `/t/<slug>/student/exam-sessions/7620c18d-.../submit`

#### Scenario: Body exact match al contrato

- **GIVEN** `EnvioRequest = { examId, code: "30303011", responses: {"P1": "A"}, clientFinishedAt: "2026-06-17T15:29:54.531Z" }`
- **WHEN** `enviar()` emite el POST
- **THEN** el body es `{ "code": "30303011", "responses": {"P1": "A"}, "client_finished_at": "2026-06-17T15:29:54.531Z" }`

### Requirement: Envío del simulacro con `clientFinishedAt`

El sistema SHALL exponer `EnviarSimulacroUseCase` (L2) que toma `{examId}`, lee identity desde `IdentityStorage` para resolver `code`, lee marcaciones de `MarkingsStorage`, computa el `clientFinishedAt` con el `Clock` server-anchored, reshape `AnswersMap` a `responses` con prefijo `P` y filtro de null, y delega el POST al puerto `ExamsApi.enviar`. Sobre éxito, persiste el ack en `MarkingsStorage` y borra marcaciones. Sobre `NetworkError`, encola el payload completo. Sobre otros errores de dominio, propaga sin tocar storage.
(Previously: usaba `clientSubmittedAt` sin code; `ExamsApi.enviar` era stub.)

#### Scenario: clientFinishedAt usa Clock server-anchored

- **GIVEN** el `Clock` retorna `new Date("2026-06-17T15:29:54.531Z")` y no se pasa `clientSubmittedAtOverride`
- **WHEN** se invoca `EnviarSimulacroUseCase.execute({ examId })`
- **THEN** el `EnvioRequest` enviado al adapter tiene `clientFinishedAt: "2026-06-17T15:29:54.531Z"`

#### Scenario: clientSubmittedAtOverride respeta el timestamp recibido

- **GIVEN** el caller pasa `clientSubmittedAtOverride: new Date("2026-06-17T11:00:00.000Z")` (ej. ProgramarAutoEnvioUseCase fuerza el cierre exacto)
- **WHEN** se invoca `execute({ examId, clientSubmittedAtOverride })`
- **THEN** el `EnvioRequest` tiene `clientFinishedAt: "2026-06-17T11:00:00.000Z"`

## REMOVED Requirements

### Requirement ELIMINADO: POST enviar es stub síncrono

El stub que lanzaba `SubmissionNotAvailableError` sin tocar HTTP se elimina. Reemplazado por POST real.

### Requirement ELIMINADO: SubmissionNotAvailableError como clase independiente

La clase deja de existir. Cleanup completo de L1 + L2 + LR.

### Requirement ELIMINADO: View-model trata SubmissionNotAvailableError como error no recuperable

El branch del view-model que manejaba este error se elimina junto con la clase.
