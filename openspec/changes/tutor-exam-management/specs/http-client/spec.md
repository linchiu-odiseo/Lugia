# Delta for http-client (tutor-exam-management)

> Esta capability es **MODIFICADA**. Este delta es ADITIVO — no altera ninguno de los Requirements existentes en `openspec/specs/http-client/spec.md`.
> Al archivar este change, este delta se fusiona en `openspec/specs/http-client/spec.md`.

## ADDED Requirements

### Requirement: apiPath — 6 nuevos helpers para endpoints del tutor

`src/L3_periphery/http/api-paths.ts` (única fuente de verdad para URLs de learnex) SHALL añadir los siguientes 6 helpers. Todos SHALL aplicar `encodeURIComponent` sobre los parámetros de path. Ningún adapter L3 SHALL construir estas URLs concatenando strings directamente.

```
tutorVirtualExams(): string
  → <base>/tutor/virtual-exams

virtualExam(recordId: string): string
  → <base>/virtual-exams/<encodedRecordId>

classroomStudents(classroomId: string, virtualExamDetailId: string): string
  → <base>/classrooms/<encodedClassroomId>/students?virtualExamDetailId=<encodedDetailId>

virtualExamEnabledStudents(recordId: string): string
  → <base>/virtual-exams/<encodedRecordId>/enabled-students

virtualExamStart(recordId: string): string
  → <base>/virtual-exams/<encodedRecordId>/start

virtualExamFinalize(recordId: string): string
  → <base>/virtual-exams/<encodedRecordId>/finalize
```

Los helpers SHALL agregarse al objeto `apiPath` existente — NO crear un objeto separado.

#### Scenario: tutorVirtualExams genera URL correcta

- **GIVEN** `environment.tenantSlug = "vonex"`, `environment.apiBaseUrl = "http://api.example.com"`
- **WHEN** se invoca `apiPath.tutorVirtualExams()`
- **THEN** retorna `"http://api.example.com/t/vonex/tutor/virtual-exams"`

#### Scenario: virtualExam usa encodeURIComponent sobre recordId

- **GIVEN** `recordId = "rec-123"`
- **WHEN** se invoca `apiPath.virtualExam("rec-123")`
- **THEN** retorna `"<base>/virtual-exams/rec-123"`

- **GIVEN** `recordId = "foo/bar"` (caracteres especiales)
- **WHEN** se invoca `apiPath.virtualExam("foo/bar")`
- **THEN** retorna `"<base>/virtual-exams/foo%2Fbar"`

#### Scenario: classroomStudents incluye classroomId en path y virtualExamDetailId en query

- **GIVEN** `classroomId = "cls-1"`, `virtualExamDetailId = "det-abc"`
- **WHEN** se invoca `apiPath.classroomStudents("cls-1", "det-abc")`
- **THEN** retorna `"<base>/classrooms/cls-1/students?virtualExamDetailId=det-abc"`

#### Scenario: classroomStudents aplica encodeURIComponent sobre ambos params

- **GIVEN** `classroomId = "cls/1"`, `virtualExamDetailId = "det abc"`
- **WHEN** se invoca `apiPath.classroomStudents("cls/1", "det abc")`
- **THEN** el classroomId en el path es `"cls%2F1"`
- **AND** el virtualExamDetailId en el query es `"det%20abc"`

#### Scenario: virtualExamEnabledStudents genera URL correcta

- **GIVEN** `recordId = "rec-1"`
- **WHEN** se invoca `apiPath.virtualExamEnabledStudents("rec-1")`
- **THEN** retorna `"<base>/virtual-exams/rec-1/enabled-students"`

#### Scenario: virtualExamStart genera URL correcta

- **GIVEN** `recordId = "rec-1"`
- **WHEN** se invoca `apiPath.virtualExamStart("rec-1")`
- **THEN** retorna `"<base>/virtual-exams/rec-1/start"`

#### Scenario: virtualExamFinalize genera URL correcta

- **GIVEN** `recordId = "rec-1"`
- **WHEN** se invoca `apiPath.virtualExamFinalize("rec-1")`
- **THEN** retorna `"<base>/virtual-exams/rec-1/finalize"`

#### Scenario: Los 6 helpers están en el objeto apiPath existente

- **WHEN** se inspecciona `api-paths.ts` después del change
- **THEN** `apiPath` es un único objeto que contiene tanto los helpers pre-existentes (`login`, `studentExamSubmit`, etc.) como los 6 nuevos helpers del tutor

---

### Requirement: Clasificación de errores del tutor — por status, sin leer message

La regla de clasificación de errores de `http-client` (exclusivamente por `status`, `endpoint`, y `code` estructurado — ver spec base) SHALL extenderse con la tabla específica para el adaptador `HttpTutorExamsApi`. Esta clasificación es por status PURO (sin leer `body.message` ni `body.code`), documentada como excepción al patrón del alumno por la ausencia de códigos de control granulares en el flujo tutor.

| HTTP Status | Error de dominio (tutor) |
|---|---|
| 400 | `InvalidPayloadError` |
| 401 | manejado por `credentials.interceptor` (refresh + retry) |
| 403 | `TutorExamForbiddenError` |
| 404 | `VirtualExamNotFoundError` |
| 409 | `ExamConflictError` |
| 422 | `ExamPreconditionError` |
| 0 / 429 / 5xx | `NetworkError` |
| timeout / transporte | `NetworkError` |

Un comentario inline en `HttpTutorExamsApi.classifyTutorError` SHALL documentar la razón de clasificación por status puro (el back tutor emite codes genéricos + messages en prosa variable, no contrato de control en snake_case).

#### Scenario: Tabla de clasificación por status — tutor

- **GIVEN** los errores HTTP listados en la tabla
- **WHEN** `HttpTutorExamsApi.classifyTutorError(err)` los procesa
- **THEN** cada status mapea al error de dominio indicado en la tabla

#### Scenario: Clasificador tutor NOT lee body.message

- **WHEN** se inspecciona `classifyTutorError`
- **THEN** no aparecen comparaciones de `body.message` ni de strings en prosa del backend
- **AND** la clasificación usa exclusivamente `err.status`

#### Scenario: Clasificadores del alumno y del tutor son independientes

- **WHEN** se modifica el clasificador del tutor (`classifyTutorError`)
- **THEN** `classifySubmitError` y `classifyDraftError` (alumno) permanecen sin cambios
- **AND** viceversa

#### Scenario: Prohibido el literal del slug en los nuevos helpers

- **WHEN** se inspecciona `api-paths.ts` tras el change
- **THEN** los 6 nuevos helpers usan `environment.tenantSlug` (vía `base()`), no un literal como `"vonex"`
