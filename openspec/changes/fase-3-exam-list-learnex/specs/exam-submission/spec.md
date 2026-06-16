# Delta for exam-submission

## ADDED Requirements

### Requirement: SubmissionNotAvailableError como clase independiente

La capa L1 SHALL definir `SubmissionNotAvailableError` como clase de error independiente. MUST NOT extender `NetworkError`. Razón: `EnviarSimulacroUseCase` captura `NetworkError` y encola en IDB; si `SubmissionNotAvailableError` heredara `NetworkError`, el outbox IDB acumularía entradas indefinidamente mientras el stub esté activo.

#### Scenario: SubmissionNotAvailableError no es instancia de NetworkError

- **GIVEN** una instancia de `SubmissionNotAvailableError`
- **WHEN** se evalúa `error instanceof NetworkError`
- **THEN** el resultado es `false`

### Requirement: POST enviar es stub síncrono en este change

El método `ExamsApi.enviar` en el adapter `HttpExamsApi` SHALL lanzar `SubmissionNotAvailableError` SINCRÓNICAMENTE, sin realizar ninguna llamada HTTP. El stub será reemplazado por la implementación real en `fase-3-exam-submit-learnex`.

#### Scenario: POST enviar lanza error sin llamada HTTP

- **GIVEN** el adapter `HttpExamsApi` está instanciado
- **WHEN** se invoca `ExamsApi.enviar(examId, payload)`
- **THEN** el método lanza `SubmissionNotAvailableError` de forma síncrona
- **AND** ninguna request HTTP es emitida (verificable mediante spy de `HttpClient`)

#### Scenario: EnviarSimulacroUseCase no encola SubmissionNotAvailableError en IDB

- **GIVEN** `ExamsApi.enviar` lanza `SubmissionNotAvailableError`
- **WHEN** `EnviarSimulacroUseCase.execute()` procesa el error
- **THEN** el error NO cae en el branch de `NetworkError`
- **AND** no se crea ninguna entrada en la cola de envíos pendientes de `MarkingsStorage`

#### Scenario: View-model trata SubmissionNotAvailableError como error no recuperable

- **GIVEN** `EnviarSimulacroUseCase` propaga `SubmissionNotAvailableError`
- **WHEN** el error handler del view-model lo procesa
- **THEN** cae en el branch genérico `unknown` y navega a `/home`
- **AND** NO se muestra copy de UI específico para este error en este change

## MODIFIED Requirements

### Requirement: Envío del simulacro con `clientSubmittedAt`

El sistema SHALL exponer `EnviarSimulacroUseCase` (L2) que toma el `examId`, lee las marcaciones de `MarkingsStorage`, computa el `clientSubmittedAt` con el `Clock` server-anchored, y delega el POST al puerto `ExamsApi.enviar`. En este change, `ExamsApi.enviar` es un stub que lanza `SubmissionNotAvailableError`; el contrato completo de POST (URL, body con `clientFinishedAt` + `clientSubmittedAt`, códigos de error) queda definido en `fase-3-exam-submit-learnex`.
(Previously: referenciaba `simulacroId` y `SimulacrosApi.enviar` con contrato HTTP real.)

#### Scenario: Envío exitoso dentro de ventana

- **WHEN** el alumno toca "Enviar" dentro de la ventana del examen y la red está disponible
- **THEN** `EnviarSimulacroUseCase.execute(examId)` invoca `ExamsApi.enviar`
- **AND** (stub activo) lanza `SubmissionNotAvailableError` — no hay respuesta de backend en este change

#### Scenario: Idempotencia — envío duplicado

- **WHEN** se invoca `EnviarSimulacroUseCase` para un examen que ya fue enviado
- **THEN** el comportamiento idempotente completo se define en `fase-3-exam-submit-learnex`

#### Scenario: Backend rechaza por `clientSubmittedAt` fuera de ventana

- **WHEN** el `clientSubmittedAt` enviado cae fuera de ventana
- **THEN** el manejo de 400 `INVALID_TIME` se define en `fase-3-exam-submit-learnex`

#### Scenario: Backend reporta examen ya cerrado

- **WHEN** el backend responde 403 con `code: "CLOSED"` al POST
- **THEN** el manejo de `SimulacroCerradoError` se define en `fase-3-exam-submit-learnex`

#### Scenario: Backend reporta shape inválido

- **WHEN** el backend responde 400 con `code: "INVALID_SHAPE"`
- **THEN** el manejo de `InvalidPayloadError` se define en `fase-3-exam-submit-learnex`

#### Scenario: Backend reporta examen no asignado

- **WHEN** el backend responde 404
- **THEN** el manejo de `SimulacroNoAsignadoError` se define en `fase-3-exam-submit-learnex`

#### Scenario: Sesión expirada durante envío

- **WHEN** el backend responde 401
- **THEN** el interceptor `credentials` maneja refresh y redirect — sin cambio respecto a Fase 3 login

### Requirement: Errores de dominio para envío

La capa L1 SHALL definir los errores `InvalidSubmissionTimeError`, `SimulacroCerradoError`, `SimulacroNoAsignadoError`, `InvalidPayloadError` (sin cambio de nombre ni semántica en este change). Se AÑADE `SubmissionNotAvailableError` como clase independiente (ver Requirement correspondiente). La clasificación por `(status, endpoint, body.code)` aplica al contrato POST que se activa en `fase-3-exam-submit-learnex`.
(Previously: misma lista de errores, sin `SubmissionNotAvailableError`.)

#### Scenario: Mapeo de 400 INVALID_TIME

- **WHEN** el backend responde 400 con `code: "INVALID_TIME"` al POST
- **THEN** el adapter HTTP lanza `InvalidSubmissionTimeError`

#### Scenario: Mapeo de 403 CLOSED

- **WHEN** el backend responde 403 con `code: "CLOSED"`
- **THEN** el adapter HTTP lanza `SimulacroCerradoError`

#### Scenario: Mapeo de 404

- **WHEN** el backend responde 404
- **THEN** el adapter HTTP lanza `SimulacroNoAsignadoError`

#### Scenario: Clasificación por (status, endpoint) no por mensaje

- **WHEN** el backend responde 400 con cualquier `message`
- **THEN** el adapter clasifica solo por `code` del body o por endpoint, nunca por el `message`
