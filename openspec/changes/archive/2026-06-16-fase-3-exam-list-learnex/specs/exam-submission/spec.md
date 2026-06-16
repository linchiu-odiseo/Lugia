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

(Rest of modified requirements match merged version in main specs.)
