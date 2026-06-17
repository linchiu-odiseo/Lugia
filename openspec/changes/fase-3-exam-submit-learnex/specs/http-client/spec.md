# Delta for http-client

## ADDED Requirements

### Requirement: apiPath.studentExamSubmit

El helper `apiPath` en L3 SHALL exponer el método `studentExamSubmit(sessionId: string): string` que construye la URL `<base>/student/exam-sessions/<encodedSessionId>/submit`. El `sessionId` SHALL aplicarse `encodeURIComponent` para defensa básica (aunque el contrato lo define como UUID v4, no se asume sanitización upstream).

#### Scenario: URL armada con tenantSlug y sessionId

- **GIVEN** `environment.tenantSlug = "vonex"`, `environment.apiBaseUrl = "http://api.yangpimpollo.com"`, y `sessionId = "7620c18d-5b4d-4ef0-bf41-98352d21c2cf"`
- **WHEN** se invoca `apiPath.studentExamSubmit(sessionId)`
- **THEN** retorna `"http://api.yangpimpollo.com/t/vonex/student/exam-sessions/7620c18d-5b4d-4ef0-bf41-98352d21c2cf/submit"`

#### Scenario: sessionId con caracteres especiales se encodea

- **GIVEN** `sessionId = "foo/bar"`
- **WHEN** se invoca `apiPath.studentExamSubmit(sessionId)`
- **THEN** el segmento de URL del sessionId es `"foo%2Fbar"`

### Requirement: Clasificación POST submit por (status, body.message)

El adapter `HttpExamsApi.enviar` SHALL clasificar errores HTTP del endpoint `POST /t/{slug}/student/exam-sessions/{sessionId}/submit` usando `(status, body.message)` según la tabla siguiente:

| Status | body.message | Error de dominio |
|---|---|---|
| 400 | (cualquiera) | `InvalidPayloadError` |
| 401 | (cualquiera) | manejado por `credentials.interceptor` (refresh + retry) |
| 403 | `STUDENT_NOT_ENROLLED` | `StudentNotEnrolledError` |
| 403 | `STUDENT_MISMATCH` | `NetworkError` (genérico, sin clase dedicada) |
| 403 | otros / ausente | `NetworkError` |
| 404 | (cualquiera) | `SimulacroNoAsignadoError` |
| 409 | `SESSION_NOT_ACTIVE` | `SimulacroCerradoError` |
| 409 | otros / ausente | `NetworkError` |
| 422 | `CLOCK_SKEW_BEFORE_START` | `InvalidSubmissionTimeError` |
| 422 | `CLOCK_SKEW_TOO_FAR_FUTURE` | `InvalidSubmissionTimeError` |
| 422 | otros / ausente | `NetworkError` |
| 429 | (cualquiera) | `NetworkError` |
| 5xx | (cualquiera) | `NetworkError` |
| 0 / transporte | — | `NetworkError` |

#### Scenario: 403 STUDENT_NOT_ENROLLED → StudentNotEnrolledError

- **WHEN** POST submit responde 403 con `body: { message: "STUDENT_NOT_ENROLLED" }`
- **THEN** `enviar()` rechaza con `StudentNotEnrolledError`

#### Scenario: 403 STUDENT_MISMATCH → NetworkError genérico

- **WHEN** POST submit responde 403 con `body: { message: "STUDENT_MISMATCH" }`
- **THEN** `enviar()` rechaza con `NetworkError`

#### Scenario: 409 SESSION_NOT_ACTIVE → SimulacroCerradoError

- **WHEN** POST submit responde 409 con `body: { message: "SESSION_NOT_ACTIVE" }`
- **THEN** `enviar()` rechaza con `SimulacroCerradoError`

#### Scenario: 422 CLOCK_SKEW_* → InvalidSubmissionTimeError

- **WHEN** POST submit responde 422 con `body.message` en `{"CLOCK_SKEW_BEFORE_START", "CLOCK_SKEW_TOO_FAR_FUTURE"}`
- **THEN** `enviar()` rechaza con `InvalidSubmissionTimeError`

#### Scenario: 422 con message fuera del enum → NetworkError

- **WHEN** POST submit responde 422 con `body: { message: "UNKNOWN_REASON" }`
- **THEN** `enviar()` rechaza con `NetworkError`
- **AND** el clasificador NO compara substring ni regex sobre `message` — solo igualdad estricta contra el enum documentado

### Requirement: Excepción documentada a la regla "nunca leer message"

La regla del proyecto "clasificar exclusivamente por `(status, endpoint, code)`" SHALL admitir una excepción acotada y enumerada para el endpoint `POST /student/exam-sessions/<id>/submit`: el adapter PUEDE leer `body.message` y compararlo por **igualdad estricta** contra el set cerrado `{"STUDENT_NOT_ENROLLED", "STUDENT_MISMATCH", "SESSION_NOT_ACTIVE", "CLOCK_SKEW_BEFORE_START", "CLOCK_SKEW_TOO_FAR_FUTURE"}`. Cualquier otro valor de `message` SHALL ser ignorado y la clasificación SHALL caer al default por status.

Razón: el back de learnex emite estos valores como código de control en mayúsculas snake_case, no como i18n humano. Son contrato explícito acordado en el handoff. La regla original ("nunca leer message") busca proteger contra acoplamiento a texto i18n; los valores acá no son i18n. La excepción está acotada — un comentario inline en el adapter referencia este Requirement.

#### Scenario: Clasificador NO usa regex ni includes() sobre message

- **WHEN** se inspecciona el adapter `HttpExamsApi.enviar` classifySubmitError
- **THEN** todas las lecturas de `body.message` son comparaciones por `===` contra strings literales del enum
- **AND** NO aparecen `.includes()`, `.match()`, ni regex sobre `message`

#### Scenario: Lista de valores aceptados está documentada inline

- **WHEN** se lee el código fuente del classifier
- **THEN** existe un comentario que enumera los 5 valores del enum y referencia `design.md` D5
