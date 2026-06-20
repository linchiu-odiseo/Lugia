# Tasks — tutor-exam-management

## Preamble

This change ships as **3 sequential chained PRs**, each ≤400 changed lines, all under STRICT TDD (red → green per commit). PRs target `testing` (main); each PR branch stacks on the previous merge.

- **PR1** — Foundation: L1 port + read-models + domain errors + 6 L2 use-cases + L3 `api-paths` extensions + `HttpTutorExamsApi` adapter + `TUTOR_EXAMS_API` token + DI wiring + `FakeTutorExamsApi`. Compiles in isolation, runtime-inert (no UI injects the use-cases yet). Contains all test specs for these layers.
- **PR2** — List screen: `TutorExamsStore` + `TutorExamsListViewModel` + `TutorExamsListPage` + route update (`/tutor/home`). Depends on PR1.
- **PR3** — Management screen: `TutorExamDetailViewModel` + `TutorExamDetailPage` + new route (`/tutor/exams/:recordId`). Depends on PR2.

**TDD order inside every PR**: write the failing spec (red) → write the minimal implementation to make it green → refactor → lint clean → next unit. Code NEVER comes before its spec.

**External dependency**: learnex `feat/virtual-exam-ui` / PR #276 must be running locally for integration smoke. The 6 endpoints are NOT in `develop`. Manual smoke tasks (G7) require that branch running.

**Language domain**: headers + checklist items in English; inline copy / error messages in Spanish as they appear in the design.

---

## Review Workload Forecast

| Field | PR1 (Foundation) | PR2 (List) | PR3 (Management) |
|-------|-----------------|------------|------------------|
| Estimated changed lines | ~320–360 | ~300–340 | ~350–380 |
| 400-line budget risk | Low | Low | Medium |
| Files touched | ~18 | ~10 | ~10 |
| Chained PRs recommended | Yes | Yes | Yes |
| Delivery strategy | auto-chain | auto-chain | auto-chain |
| Chain strategy | stacked-to-main | stacked-to-main | stacked-to-main |
| Decision needed before apply | No — boundaries already decided |

PR1 is the heaviest by file count (new port, 4 domain errors, 6 use-cases, adapter, API paths, wiring, fake). Line count stays low because each file is small. PR3 is the heaviest per-file (detail VM has the copy-by-action table + guard logic), but fits within 400 lines if the template is kept minimal.

---

## Suggested Work Units

| Unit | Goal | PR | Notes |
|------|------|----|-------|
| 1A | Domain errors (4 files) + port `TutorExamsApi` + read-models | PR1 | Pure TypeScript, zero Angular |
| 1B | 6 L2 use-cases | PR1 | Depends on Unit 1A (port interface must exist) |
| 1C | `apiPath` 6 new helpers | PR1 | Modifies existing file; independent of 1A/1B |
| 1D | `HttpTutorExamsApi` + `classifyTutorError` + DTO mapping | PR1 | Depends on 1A (errors + port) and 1C (api-paths) |
| 1E | `TUTOR_EXAMS_API` token + `app.config.ts` wiring + `FakeTutorExamsApi` | PR1 | Depends on 1A + 1B + 1D |
| 2A | `TutorExamsStore` | PR2 | Depends on PR1 (`TutorExam` entity) |
| 2B | `TutorExamsListViewModel` + polling | PR2 | Depends on 2A |
| 2C | `TutorExamsListPage` + route update | PR2 | Depends on 2B |
| 3A | `TutorExamDetailViewModel` (store resolve + refetch + signals + copy-by-action + guards) | PR3 | Depends on PR2 (store) |
| 3B | `TutorExamDetailPage` + new route | PR3 | Depends on 3A |

---

## PR1 — `feat: tutor-exams foundation (L1+L2+L3) no UI`

Branch: `feat/tutor-exams-foundation`
Targets: `testing`

### Commit 1 — `test(L1): specs for TutorExam entity helpers and domain errors`

*Write failing specs first (red). No source files created yet.*

- [x] 1.1 Create `tests/unit/L1_domain/entities/tutor-exam.spec.ts`.
  - Scenario `TutorExam.puedeIniciar` returns `true` only for `'scheduled'`. Satisfies `tutor-exams-api` Requirement "Read-models TutorExam..." / Scenario "TutorExam.puedeIniciar retorna true solo para scheduled".
  - Scenario `TutorExam.puedeIniciar` returns `false` for `'in_progress'`. Same Requirement / Scenario.
  - Scenario `TutorExam.puedeIniciar` returns `false` for `'finalized'`. Same Requirement / Scenario.
  - Scenario `TutorExam.puedeFinalizar` returns `true` only for `'in_progress'`. Satisfies Scenario "TutorExam.puedeFinalizar retorna true solo para in_progress".
  - Scenario `TutorExam.puedeFinalizar` returns `false` for `'scheduled'`. Same Scenario.
  - Scenario `TutorExam.puedeFinalizar` returns `false` for `'finalized'`. Same Scenario.
  - Scenario `TutorExam.estaFinalizado` returns `true` for `'finalized'`. Satisfies Scenario "TutorExam.estaFinalizado retorna true solo para finalized".
  - Scenario `count: null` and `courseId: null` are valid TypeScript (compile-time check). Satisfies Scenario "count null y courseId null son tipos válidos".

- [x] 1.2 Create `tests/unit/L1_domain/value-objects/tutor-exam-detail.spec.ts`.
  - Scenario `TutorExamDetail` does NOT have `classroomId` field. Satisfies Scenario "TutorExamDetail NOT incluye classroomId".
  - Scenario `TutorExamDetail` does NOT have `entryId` field. Same Scenario.
  - Scenario `TutorExamDetail` has `enabledStudentIds: readonly string[]`. Same Scenario.

- [x] 1.3 Create `tests/unit/L1_domain/errors/tutor-errors.spec.ts`.
  - Scenario `VirtualExamNotFoundError` is an `Error` instance. Satisfies Scenario "Port NOT depende de implementaciones concretas" (infrastructure check) and error classification coverage from `tutor-exams-api` Requirement "Clasificación de errores del tutor".
  - Scenario `ExamConflictError` is an `Error` instance. Same Requirement.
  - Scenario `ExamPreconditionError` is an `Error` instance. Same Requirement.
  - Scenario `TutorExamForbiddenError` is an `Error` instance. Same Requirement.
  - Scenario `ExamServerStatus` file is unchanged (import and verify the same 3 known values compile). Satisfies Scenario "ExamServerStatus se reutiliza sin modificar".

- [x] 1.4 Create `tests/unit/L1_domain/ports/tutor-exams-api.spec.ts` (type-only smoke, no runtime assertions).
  - Scenario the interface `TutorExamsApi` exposes exactly 6 methods. Satisfies `tutor-exams-api` Requirement "TutorExamsApi port en L1" / Scenario "Port expone los 6 métodos exactos".
  - Scenario the file has zero Angular imports (compile-time assertion in comment). Satisfies Scenario "Port NOT depende de implementaciones concretas".

---

### Commit 2 — `feat(L1): TutorExam entity, domain VOs, errors, TutorExamsApi port`

*Make commit 1 specs green.*

- [x] 2.1 Create `src/L1_domain/errors/virtual-exam-not-found.error.ts` — `export class VirtualExamNotFoundError extends Error`. Satisfies `tutor-exams-api` Requirement "Read-models TutorExam..." (domain errors section).
- [x] 2.2 Create `src/L1_domain/errors/exam-conflict.error.ts` — `export class ExamConflictError extends Error`. Same Requirement.
- [x] 2.3 Create `src/L1_domain/errors/exam-precondition.error.ts` — `export class ExamPreconditionError extends Error`. Same Requirement.
- [x] 2.4 Create `src/L1_domain/errors/tutor-exam-forbidden.error.ts` — `export class TutorExamForbiddenError extends Error`. Same Requirement.
- [x] 2.5 Create `src/L1_domain/value-objects/classroom-student.ts` — `ClassroomStudent` with fields `studentId`, `studentCode`, `firstName`, `lastName`, `enabled: boolean`, `hasSubmitted: boolean`. Satisfies `tutor-exams-api` Requirement "Read-models TutorExam, TutorExamDetail, ClassroomStudent y FinalizeResult en L1".
- [x] 2.6 Create `src/L1_domain/value-objects/tutor-exam-detail.ts` — `TutorExamDetail` with fields: `id`, `recordId`, `status: ExamServerStatus`, `name`, `courseId: string | null`, `count: number | null`, `duration`, `enabledStudentIds: readonly string[]`, `startedAt: Date | null`, `finishedAt: Date | null`, `createdAt`. NO `classroomId`, NO `entryId`. Satisfies same Requirement / Scenario "TutorExamDetail NOT incluye classroomId".
- [x] 2.7 Create `src/L1_domain/entities/tutor-exam.ts` — `TutorExam` class with all 13 fields + helpers `puedeIniciar()`, `puedeFinalizar()`, `estaFinalizado()` using `ExamServerStatus.is(...)`. Satisfies `tutor-exams-api` Requirement "Read-models TutorExam..." / Scenarios "puedeIniciar", "puedeFinalizar", "estaFinalizado".
- [x] 2.8 Create `src/L1_domain/ports/tutor-exams-api.ts` — `FinalizeResult` type + `TutorExamsApi` interface (6 methods). Inline comment block documents HTTP error mapping per status. NO Angular imports. Satisfies `tutor-exams-api` Requirement "TutorExamsApi port en L1" / Scenarios "Port expone los 6 métodos exactos" and "Port NOT depende de implementaciones concretas".
- [x] 2.9 Verify `npm run lint` clean. Verify commit 1 specs are now green.

---

### Commit 3 — `test(L2): failing specs for 6 use-cases via FakeTutorExamsApi`

*Write failing L2 specs first (red). FakeTutorExamsApi is used here before it has a home file — define it inline or stub in fakes.ts temporarily.*

- [x] 3.1 In `tests/unit/L2_application/fakes.ts`: add `FakeTutorExamsApi` class implementing `TutorExamsApi` with the same manual-fake pattern as `FakeExamsApi` — recordable calls + programmable resolve/reject per method. All 6 methods: `willResolve/willReject` controls, `getCallCount()`, `getCalls()` accessors. Satisfies `tutor-exams-api` Requirement "Token de inyección TUTOR_EXAMS_API" / Scenario "FakeTutorExamsApi implementa el port completo".
- [x] 3.2 Create `tests/unit/L2_application/get-tutor-exams.use-case.spec.ts`.
  - Scenario delegates to `TutorExamsApi.getTutorExams()` and returns the list as-is. Satisfies `tutor-exams-api` Requirement "6 use-cases L2" / Scenario "GetTutorExamsUseCase delega al port y retorna lista".
  - Scenario propagates `NetworkError` without wrapping. Satisfies Scenario "Use-cases propaganErrores del port sin envoltorio".
  - Scenario does NOT call `enqueueEnvio`, `setSubmissionAck`, or IDB. Satisfies Scenario "Use-cases NO tocan outbox ni IndexedDB".
- [x] 3.3 Create `tests/unit/L2_application/get-tutor-exam-detail.use-case.spec.ts`.
  - Scenario delegates `execute({ recordId })` to `getExamDetail(recordId)` and returns `TutorExamDetail`. Satisfies `tutor-exams-api` Requirement "6 use-cases L2".
  - Scenario propagates `VirtualExamNotFoundError` as-is. Same Requirement / Scenario "Use-cases propaganErrores del port sin envoltorio".
- [x] 3.4 Create `tests/unit/L2_application/list-classroom-students.use-case.spec.ts`.
  - Scenario delegates `execute({ classroomId, virtualExamDetailId })` and returns `ClassroomStudent[]`. Satisfies `tutor-exams-api` Requirement "6 use-cases L2".
  - Scenario propagates `TutorExamForbiddenError` as-is. Same Requirement.
- [x] 3.5 Create `tests/unit/L2_application/iniciar-examen.use-case.spec.ts`.
  - Scenario delegates `execute({ recordId })` to `iniciar(recordId)` → void. Satisfies `tutor-exams-api` Requirement "6 use-cases L2".
  - Scenario propagates `ExamPreconditionError` as-is. Satisfies Scenario "Use-cases propaganErrores del port sin envoltorio".
  - Scenario does NOT call IDB or outbox. Satisfies Scenario "Use-cases NO tocan outbox ni IndexedDB".
- [x] 3.6 Create `tests/unit/L2_application/finalizar-examen.use-case.spec.ts`.
  - Scenario delegates `execute({ recordId })` and returns `FinalizeResult`. Satisfies Scenario "FinalizarExamenUseCase propaga FinalizeResult".
  - Scenario propagates `ExamConflictError` as-is. Same Requirement.
- [x] 3.7 Create `tests/unit/L2_application/actualizar-alumnos-habilitados.use-case.spec.ts`.
  - Scenario delegates `execute({ recordId, enabledStudentIds })` to `updateEnabledStudents(...)` → void. Satisfies `tutor-exams-api` Requirement "6 use-cases L2".
  - Scenario propagates `ExamConflictError` as-is. Same Requirement.

---

### Commit 4 — `feat(L2): 6 tutor use-cases (pure, constructor injection, execute delegates)`

*Make commit 3 specs green.*

- [x] 4.1 Create `src/L2_application/use-cases/get-tutor-exams.use-case.ts` — `GetTutorExamsUseCase`. Constructor accepts `TutorExamsApi`. `execute()` delegates to `api.getTutorExams()`. No decorators. Satisfies `tutor-exams-api` Requirement "6 use-cases L2".
- [x] 4.2 Create `src/L2_application/use-cases/get-tutor-exam-detail.use-case.ts` — `GetTutorExamDetailUseCase`. `execute({ recordId })`. No decorators. Same Requirement.
- [x] 4.3 Create `src/L2_application/use-cases/list-classroom-students.use-case.ts` — `ListClassroomStudentsUseCase`. `execute({ classroomId, virtualExamDetailId })`. No decorators. Same Requirement.
- [x] 4.4 Create `src/L2_application/use-cases/iniciar-examen.use-case.ts` — `IniciarExamenUseCase`. `execute({ recordId }): Promise<void>`. No decorators. Same Requirement.
- [x] 4.5 Create `src/L2_application/use-cases/finalizar-examen.use-case.ts` — `FinalizarExamenUseCase`. `execute({ recordId }): Promise<FinalizeResult>`. No decorators. Same Requirement.
- [x] 4.6 Create `src/L2_application/use-cases/actualizar-alumnos-habilitados.use-case.ts` — `ActualizarAlumnosHabilitadosUseCase`. `execute({ recordId, enabledStudentIds: readonly string[] }): Promise<void>`. No decorators. Same Requirement.
- [x] 4.7 Verify `npm run lint` clean. Verify all L2 specs (commit 3) are now green.

---

### Commit 5 — `test(L3-http): failing specs for apiPath 6 helpers`

*Write failing specs first (red).*

- [x] 5.1 In `tests/feature/L3_periphery/http/http-exams-api.spec.ts` (or a new file `http-tutor-exams-api.spec.ts`): add describe block for `apiPath` new helpers.
  - Scenario `apiPath.tutorVirtualExams()` returns `"<base>/tutor/virtual-exams"`. Satisfies `http-client` Requirement "apiPath — 6 nuevos helpers" / Scenario "tutorVirtualExams genera URL correcta".
  - Scenario `apiPath.virtualExam("rec-123")` returns `"<base>/virtual-exams/rec-123"`. Satisfies Scenario "virtualExam usa encodeURIComponent sobre recordId".
  - Scenario `apiPath.virtualExam("foo/bar")` returns `"<base>/virtual-exams/foo%2Fbar"`. Same Scenario.
  - Scenario `apiPath.classroomStudents("cls-1", "det-abc")` returns `"<base>/classrooms/cls-1/students?virtualExamDetailId=det-abc"`. Satisfies Scenario "classroomStudents incluye classroomId en path y virtualExamDetailId en query".
  - Scenario `apiPath.classroomStudents("cls/1", "det abc")` encodes both params. Satisfies Scenario "classroomStudents aplica encodeURIComponent sobre ambos params".
  - Scenario `apiPath.virtualExamEnabledStudents("rec-1")` returns correct URL. Satisfies Scenario "virtualExamEnabledStudents genera URL correcta".
  - Scenario `apiPath.virtualExamStart("rec-1")` returns correct URL. Satisfies Scenario "virtualExamStart genera URL correcta".
  - Scenario `apiPath.virtualExamFinalize("rec-1")` returns correct URL. Satisfies Scenario "virtualExamFinalize genera URL correcta".
  - Scenario all 6 helpers exist on the same `apiPath` object alongside pre-existing helpers. Satisfies Scenario "Los 6 helpers están en el objeto apiPath existente".
  - Scenario no literal `"vonex"` in `api-paths.ts` — helpers use `environment.tenantSlug` via `base()`. Satisfies `http-client` Requirement Scenario "Prohibido el literal del slug en los nuevos helpers".

---

### Commit 6 — `feat(L3-http): apiPath 6 new helpers with encodeURIComponent`

*Make commit 5 specs green.*

- [x] 6.1 Modify `src/L3_periphery/http/api-paths.ts` — add 6 helpers to the existing `apiPath` object:
  - `tutorVirtualExams()` → `${base()}/tutor/virtual-exams`
  - `virtualExam(recordId)` → `${base()}/virtual-exams/${encodeURIComponent(recordId)}`
  - `classroomStudents(classroomId, virtualExamDetailId)` → `${base()}/classrooms/${encodeURIComponent(classroomId)}/students?virtualExamDetailId=${encodeURIComponent(virtualExamDetailId)}`
  - `virtualExamEnabledStudents(recordId)` → `${base()}/virtual-exams/${encodeURIComponent(recordId)}/enabled-students`
  - `virtualExamStart(recordId)` → `${base()}/virtual-exams/${encodeURIComponent(recordId)}/start`
  - `virtualExamFinalize(recordId)` → `${base()}/virtual-exams/${encodeURIComponent(recordId)}/finalize`
  Satisfies `http-client` Requirement "apiPath — 6 nuevos helpers para endpoints del tutor".
- [x] 6.2 Verify `npm run lint` clean. Verify commit 5 specs are now green.

---

### Commit 7 — `test(L3-http): failing specs for HttpTutorExamsApi (6 endpoints + classifyTutorError)`

*Write failing specs first (red).*

- [x] 7.1 Create `tests/feature/L3_periphery/http/http-tutor-exams-api.spec.ts`. Use `TestBed` + `HttpTestingController` (mirrors `http-exams-api.spec.ts` pattern).

  **getTutorExams() scenarios:**
  - Scenario URL is `<base>/tutor/virtual-exams` (GET). Satisfies `tutor-exams-api` Requirement "Contrato HTTP — GET /tutor/virtual-exams" / Scenario "URL armada con apiPath.tutorVirtualExams".
  - Scenario HTTP 200 with `{ items: [...] }` maps to `TutorExam[]` with correct field mappings. Satisfies Scenario "Mapping camelCase → TutorExam con valores nominales".
  - Scenario `count: null` in DTO → `tutorExam.count === null` (not `0`, not `undefined`). Satisfies Scenario "count null en la lista → campo null (no undefined)".
  - Scenario `courseId: null` → `tutorExam.courseId === null`. Satisfies Scenario "courseId null en la lista → campo null".
  - Scenario `startedAt: "2026-06-10T08:00:00Z"` → `Date` instance. Satisfies Scenario "startedAt como string ISO → Date".
  - Scenario HTTP 403 → rejects with `TutorExamForbiddenError`. Satisfies Scenario "Error en getTutorExams → clasifica por status".

  **getExamDetail() scenarios:**
  - Scenario URL is `<base>/virtual-exams/rec-123` (GET). Satisfies Requirement "Contrato HTTP — GET /virtual-exams/:recordId" / Scenario "URL usa encodeURIComponent sobre recordId".
  - Scenario `enabledStudentIds: ["s-1","s-2"]` maps correctly. Satisfies Scenario "Mapping incluye enabledStudentIds".
  - Scenario `enabledStudentIds: []` → empty array. Satisfies Scenario "enabledStudentIds vacío → array vacío".
  - Scenario HTTP 404 → `VirtualExamNotFoundError`. Satisfies Scenario "404 en getExamDetail → VirtualExamNotFoundError".

  **listClassroomStudents() scenarios:**
  - Scenario URL is `<base>/classrooms/cls-1/students?virtualExamDetailId=det-1`. Satisfies Requirement "Contrato HTTP — GET /classrooms/:classroomId/students" / Scenario "URL incluye classroomId en path y virtualExamDetailId en query".
  - Scenario `virtualExamDetailId` uses `detailId` (dto.id), NOT `recordId`. Satisfies Scenario "virtualExamDetailId toma el detailId (dto.id), no el recordId".
  - Scenario DTO maps to `ClassroomStudent` 1:1. Satisfies Scenario "Mapping ClassroomStudentDto → ClassroomStudent".
  - Scenario `hasSubmitted: true` preserved. Satisfies Scenario "hasSubmitted:true se preserva en el read-model".
  - Scenario HTTP 403 → `TutorExamForbiddenError`. Satisfies Scenario "403 en listClassroomStudents → TutorExamForbiddenError".

  **updateEnabledStudents() scenarios:**
  - Scenario PATCH `<base>/virtual-exams/rec-1/enabled-students` with body `{ enabledStudentIds: ["s-1","s-2"] }`. Satisfies Requirement "Contrato HTTP — PATCH /virtual-exams/:recordId/enabled-students" / Scenario "URL y body del PATCH".
  - Scenario HTTP 200 empty body → resolves `void`. Satisfies Scenario "200 vacío resuelve void".
  - Scenario HTTP 409 → `ExamConflictError`. Satisfies Scenario "409 en updateEnabledStudents → ExamConflictError".
  - Scenario HTTP 422 → `ExamPreconditionError`. Satisfies Scenario "422 en updateEnabledStudents → ExamPreconditionError".

  **iniciar() scenarios:**
  - Scenario POST `<base>/virtual-exams/rec-1/start` with no body. Satisfies Requirement "Contrato HTTP — POST /virtual-exams/:recordId/start" / Scenario "URL del POST start, sin body".
  - Scenario HTTP 204 → resolves `void`. Satisfies Scenario "204 resuelve void".
  - Scenario HTTP 409 → `ExamConflictError`. Satisfies Scenario "409 en iniciar → ExamConflictError".
  - Scenario HTTP 422 → `ExamPreconditionError`. Satisfies Scenario "422 en iniciar → ExamPreconditionError".

  **finalizar() scenarios:**
  - Scenario POST `<base>/virtual-exams/rec-1/finalize` with no body. Satisfies Requirement "Contrato HTTP — POST /virtual-exams/:recordId/finalize" / Scenario "URL del POST finalize, sin body".
  - Scenario HTTP 200 `{ transitioned: true, jobId: "job-xyz" }` → `FinalizeResult` with `transitioned: true`. Satisfies Scenario "200 con transitioned:true — primera finalización".
  - Scenario HTTP 200 `{ transitioned: false }` → `FinalizeResult { transitioned: false, jobId: undefined }` — NOT an error. Satisfies Scenario "200 con transitioned:false — ya estaba finalizado (idempotente)".
  - Scenario `jobId` absent in body → `jobId: undefined`. Satisfies Scenario "jobId es opcional — ausente en 200 → undefined en FinalizeResult".
  - Scenario HTTP 409 → `ExamConflictError`. Satisfies Scenario "409 en finalizar → ExamConflictError".
  - Scenario HTTP 422 → `ExamPreconditionError`. Satisfies Scenario "422 en finalizar → ExamPreconditionError".

  **classifyTutorError() scenarios (one describe block):**
  - Scenario 400 → `InvalidPayloadError`. Satisfies `tutor-exams-api` Requirement "Clasificación de errores del tutor por status" / Scenario "400 → InvalidPayloadError".
  - Scenario 403 → `TutorExamForbiddenError`. Satisfies Scenario "403 → TutorExamForbiddenError".
  - Scenario 404 → `VirtualExamNotFoundError`. Satisfies Scenario "404 → VirtualExamNotFoundError".
  - Scenario 409 → `ExamConflictError`. Satisfies Scenario "409 → ExamConflictError".
  - Scenario 422 → `ExamPreconditionError`. Satisfies Scenario "422 → ExamPreconditionError".
  - Scenario 0, 429, 500, 502, 503, 504 → `NetworkError`. Satisfies Scenario "0 / 429 / 5xx → NetworkError".
  - Scenario timeout (>10 000 ms) → `NetworkError`. Satisfies Scenario "Timeout → NetworkError".
  - Also verifies `classifyTutorError` uses exclusively `err.status`, never `body.message` nor `body.code`. Satisfies Scenarios "Clasificador NO lee body.message ni body.code" and `http-client` Scenario "Clasificador tutor NOT lee body.message".
  - Scenario student classifiers (`classifySubmitError`, `classifyDraftError`) are untouched. Satisfies `http-client` Scenario "Clasificadores del alumno y del tutor son independientes".
  - Scenario adapter does NOT manually set `withCredentials`. (Assert via `HttpTestingController` request inspection.)

---

### Commit 8 — `feat(L3-http): HttpTutorExamsApi adapter with classifyTutorError and DTO mapping`

*Make commit 7 specs green.*

- [x] 8.1 Create `src/L3_periphery/http/http-tutor-exams-api.ts`. `@Injectable({ providedIn: 'root' })`. Inject `HttpClient`. Implement all 6 port methods using `firstValueFrom(this.http.<verb>(...).pipe(timeout(10_000)))`. All wrapped in `try/catch` routing through `classifyTutorError`. No manual `withCredentials` (interceptor handles it). Satisfies `tutor-exams-api` Requirements for all 6 HTTP contracts.
- [x] 8.2 In the same file: implement `classifyTutorError(err: unknown): Error`. Switch on `err.status`: 400 → `InvalidPayloadError`, 403 → `TutorExamForbiddenError`, 404 → `VirtualExamNotFoundError`, 409 → `ExamConflictError`, 422 → `ExamPreconditionError`, everything else → `NetworkError`. Inline comment documents: (a) classification by pure status; (b) why NOT reading `body.message` (generic codes + prose messages, not control codes); (c) reference to design.md D2. Satisfies `tutor-exams-api` Requirement "Clasificación de errores del tutor por status".
- [x] 8.3 In `finalizar()`: inline comment documents that the endpoint returns **200** (not 202/204) with body `{ transitioned, jobId? }`, referencing learnex PR #276 discrepancy. Satisfies design.md R2.
- [x] 8.4 Implement DTO → domain mappings:
  - `getTutorExams`: `dto.id → detailId`, `dto.recordId → recordId`, `dto.classroomId`, `dto.entryId`, `new ExamServerStatus(dto.status)`, nullable `count`/`courseId`, `string → Date` for timestamps (null-safe). Satisfies `tutor-exams-api` Requirement "Contrato HTTP — GET /tutor/virtual-exams" (all mapping Scenarios).
  - `getExamDetail`: same scalar mapping + `dto.enabledStudentIds`. Satisfies Requirement "Contrato HTTP — GET /virtual-exams/:recordId".
  - `listClassroomStudents`: 1:1 DTO → `ClassroomStudent`. Satisfies Requirement "Contrato HTTP — GET /classrooms/:classroomId/students".
- [x] 8.5 Verify `npm run lint` clean. Verify commit 7 specs are now green.

---

### Commit 9 — `feat(L3): TUTOR_EXAMS_API token + app.config wiring + FakeTutorExamsApi`

- [x] 9.1 Add `export const TUTOR_EXAMS_API = new InjectionToken<TutorExamsApi>('TUTOR_EXAMS_API')` in `src/L3_periphery/tokens.ts` (or a new `src/L3_periphery/tutor-tokens.ts`). Satisfies `tutor-exams-api` Requirement "Token de inyección TUTOR_EXAMS_API y wiring en app.config.ts" / Scenario "Token y provider existen en app.config.ts".
- [x] 9.2 Modify `src/app.config.ts`: add:
  - `{ provide: TUTOR_EXAMS_API, useExisting: HttpTutorExamsApi }`
  - 6 factory providers (one per use-case, each with `deps: [TUTOR_EXAMS_API]`) per design.md D7 template.
  Satisfies `tutor-exams-api` Requirement "Token de inyección" / Scenario "Token y provider existen en app.config.ts".
- [x] 9.3 Create `src/L3_periphery/fakes/fake-tutor-exams-api.ts` — `FakeTutorExamsApi implements TutorExamsApi` with stub methods returning fixed data (arrays, void, `FinalizeResult`). TypeScript must compile without errors. Satisfies Scenario "FakeTutorExamsApi implementa el port completo". (This is the src-side version for injection in test AppConfig; the `tests/` version added in commit 3.1 is for L2 unit tests.)
- [x] 9.4 Write a type-level integration test snippet (in commit 9's spec or in an existing spec file) verifying `TUTOR_EXAMS_API` token type resolves to `TutorExamsApi` when `FakeTutorExamsApi` is provided. Satisfies Scenario "FakeTutorExamsApi implementa el port completo".
- [x] 9.5 Verify `npm run lint` clean. Run `npm test` — all 3-PR1 specs pass, existing suite unaffected.

---

### PR1 Pre-merge Gates

- [x] G1-PR1 **lint clean**: `npm run lint` exits 0.
- [x] G2-PR1 **tests green**: `npm test` exits 0. All new specs pass; existing specs unaffected.
- [x] G3-PR1 **no `"vonex"` literal in `src/`**: `rg '"vonex"' src/` returns empty. Satisfies CLAUDE.md rule.
- [x] G4-PR1 **build clean**: `npm run build` exits 0 (PR1 compiles isolated; no page routes it yet → runtime-inert as designed).
- [x] G5-PR1 **hexagonal boundary**: `TutorExamsApi` port file (`L1`) has zero Angular imports. `HttpTutorExamsApi` (`L3`) does not import L2 use-cases directly. Use-cases do not import `HttpClient`, `Injectable`, or Angular DI.
- [x] G6-PR1 **finalize 200 assertion**: the `http-tutor-exams-api.spec.ts` explicitly tests HTTP 200 (not 202 or 204) for `finalizar()` and asserts the body `{ transitioned, jobId? }` is read. Verifies design.md R2 mitigation.

---

## PR2 — `feat: tutor exam list screen (/tutor/home)`

Branch: `feat/tutor-exam-list`
Targets: `testing` (stacks on PR1 merged)

### Commit 10 — `test(LR): failing specs for TutorExamsStore`

*Write failing spec first (red).*

- [x] 10.1 Create `tests/feature/LR_render/view-models/tutor-exams.store.spec.ts`.
  - Scenario `setExams([exam1, exam2])` then `findByRecordId("rec-1")` returns `exam1`. Satisfies `tutor-exam-list` Requirement "Store compartido de la lista" / Scenario "Store permite resolver classroomId por recordId".
  - Scenario empty store → `findByRecordId("any")` returns `null` (miss). Satisfies Scenario "Store vacío — classroomId no resuelve desde store".
  - Scenario `setExams(newList)` updates `list` signal immediately. Satisfies Scenario "Store actualizado tras polling".
  - Scenario `clear()` empties the list. (Supports D1 refetch after clear edge case.)
  - Scenario `findByRecordId` with populated store returns `classroomId` and `detailId` from the matching exam. Satisfies Scenario "Store permite resolver classroomId por recordId".

---

### Commit 11 — `feat(LR): TutorExamsStore — root singleton`

*Make commit 10 specs green.*

- [x] 11.1 Create `src/LR_render/state/tutor-exams.store.ts`. `@Injectable({ providedIn: 'root' })`. Private `_exams = signal<readonly TutorExam[]>([])`. Public `exams = _exams.asReadonly()`. Methods: `setExams(exams)`, `findByRecordId(recordId): TutorExam | null`, `upsert(exam: TutorExam)` (replace by recordId or append), `clear()`. Satisfies `tutor-exam-list` Requirement "Store compartido de la lista".
- [x] 11.2 Verify `npm run lint` clean. Commit 10 specs green.

---

### Commit 12 — `test(LR): failing specs for TutorExamsListViewModel`

*Write failing spec first (red).*

- [x] 12.1 Create `tests/feature/LR_render/view-models/tutor-exams-list.view-model.spec.ts`. Use `TestBed`, `vi.useFakeTimers()`, fake `GetTutorExamsUseCase` (via `FakeTutorExamsApi`), and a real or fake `TutorExamsStore`.
  - Scenario `exams()` loads on init → `[exam1, exam2]`; `loading()` false; `error()` false. Satisfies `tutor-exam-list` Requirement "TutorExamsListViewModel" / Scenario "Lista cargada correctamente al iniciar".
  - Scenario `GetTutorExamsUseCase.execute()` rejects with `NetworkError` → `error()` is `true`; `exams()` unchanged; polling continues. Satisfies Scenario "Error de red — error Signal activa, polling continúa".
  - Scenario visibility change to `'hidden'` → no HTTP request emitted. Satisfies Scenario "Polling se pausa al ocultar el tab".
  - Scenario visibility change back to `'visible'` → fires an immediate load; resumes 120s interval. Satisfies Scenario "Polling se reanuda al volver al tab".
  - Scenario advance fake timers by 120 000 ms → `GetTutorExamsUseCase.execute()` called a second time; list updates. Satisfies Scenario "Polling cada 120 s emite nuevo request".
  - Scenario successful load calls `TutorExamsStore.setExams(list)`. Satisfies `tutor-exam-list` Requirement "Store compartido" / Scenario "Store actualizado tras polling".
  - Scenario VM is NOT `providedIn: 'root'` (local provider check). Satisfies `tutor-exam-list` Requirement "TutorExamsListPage provee la VM como provider local" / Scenario "VM es local al componente page".

---

### Commit 13 — `feat(LR): TutorExamsListViewModel with 120s polling and store publish`

*Make commit 12 specs green.*

- [x] 13.1 Create `src/LR_render/view-models/tutor-exams-list.view-model.ts`. `@Injectable()` (no `providedIn`). Inject `GetTutorExamsUseCase`, `GetProfileUseCase('tutor')`, `TutorExamsStore`. Expose `exams: Signal`, `loading: Signal`, `error: Signal`. `POLL_INTERVAL_MS = 120_000`. Load on init; on success call `store.setExams(list)`. Pause polling on `visibilitychange → hidden`; reload and resume on `→ visible`. Error handler sets `error = true` without clearing `exams`. Satisfies `tutor-exam-list` Requirement "TutorExamsListViewModel — carga y polling".
- [x] 13.2 Verify `npm run lint` clean. Commit 12 specs green.

---

### Commit 14 — `test(LR): failing specs for TutorExamsListPage and /tutor/home route`

*Write failing spec first (red).*

- [x] 14.1 Create `tests/feature/LR_render/pages/tutor-exams-list/tutor-exams-list.page.spec.ts`. Use `TestBed` + `ComponentFixture`.
  - Scenario renders one card per `TutorExam` in order (no reordering). Satisfies `tutor-exam-list` Requirement "Tarjetas con 3 estados via Signals" / Scenario "Lista renderizada en el orden devuelto por el backend".
  - Scenario `count === null` → card shows `"—"`. Satisfies Scenario "count null renderiza '—'".
  - Scenario `serverStatus.value === 'scheduled'` → badge shows "Programado". Satisfies Scenario "Tarjeta scheduled".
  - Scenario `serverStatus.value === 'in_progress'` → badge shows "En curso". Satisfies Scenario "Tarjeta in_progress".
  - Scenario `serverStatus.value === 'finalized'` → badge shows "Finalizado". Satisfies Scenario "Tarjeta finalized".
  - Scenario tap on card with `recordId === "rec-1"` → router navigates to `/tutor/exams/rec-1`. Satisfies `tutor-exam-list` Requirement "Tap en tarjeta navega a /tutor/exams/:recordId" / Scenario "Tap en tarjeta navega a la ruta de gestión".
  - Scenario tap DOES NOT navigate outside `/tutor`. Satisfies Scenario "Tap en tarjeta NOT navega fuera de /tutor".
  - Scenario `TutorExamsListViewModel` appears in page `providers`. Satisfies `tutor-exam-list` Requirement "TutorExamsListPage provee la VM como provider local" / Scenario "VM es local al componente page".

- [x] 14.2 In `tests/feature/LR_render/app.routes.spec.ts`: add/extend scenario.
  - Scenario `/tutor/home` route's `loadComponent` points to `TutorExamsListPage`. Satisfies `route-protection` Requirement "/tutor/home carga TutorExamsListPage" / Scenario "/tutor/home carga el componente de lista correcto".
  - Scenario `/tutor/home` route has `canActivate: [authGuard, roleGuard('tutor')]`. Same Requirement.
  - Scenario tutor authenticated → `/tutor/home` renders `TutorExamsListPage`. Satisfies Scenario "Tutor autenticado navega a /tutor/home — renderiza la lista".
  - Scenario student trying `/tutor/home` → redirected by `roleGuard`. Satisfies Scenario "Alumno intenta acceder a /tutor/home — redirigido (roleGuard)".
  - Scenario unauthenticated → `authGuard` redirects to `/login`. Satisfies Scenario "Usuario no autenticado intenta /tutor/home — redirigido a login".
  - Scenario no placeholder component for `/tutor/home` exists post-change. Satisfies `tutor-exam-list` Requirement "Ruta /tutor/home reemplaza el placeholder" / Scenario "Placeholder no existe tras el change".

---

### Commit 15 — `feat(LR): TutorExamsListPage + route update (/tutor/home)`

*Make commit 14 specs green.*

- [x] 15.1 Create `src/LR_render/pages/tutor-exams-list/tutor-exams-list.page.ts`. Standalone `@Component`. `providers: [TutorExamsListViewModel]`. Template renders cards with status badges; `count === null` shows `"—"`; tap calls `Router.navigate(['/tutor/exams', recordId])`. Satisfies `tutor-exam-list` Requirements "Tarjetas con 3 estados via Signals", "Tap en tarjeta navega a /tutor/exams/:recordId", "TutorExamsListPage provee la VM como provider local".
- [x] 15.2 Modify `src/LR_render/app.routes.ts`: update `/tutor/home` entry to `loadComponent` pointing to `TutorExamsListPage` (lazy). Keep `canActivate: [authGuard, roleGuard('tutor')]`. Satisfies `route-protection` Requirement "/tutor/home carga TutorExamsListPage".
- [x] 15.3 Remove or orphan the old placeholder `src/LR_render/pages/tutor-home/tutor-home.page.ts` (if referenced by a now-deleted route entry). No other route should reference it. Satisfies `tutor-exam-list` Scenario "Placeholder no existe tras el change".
- [x] 15.4 Update `tests/feature/LR_render/pages/tutor-home/tutor-home.page.spec.ts` — mark as deleted or redirect its route test to the new page if needed to keep the suite green.
- [x] 15.5 Verify `npm run lint` clean. Run `npm test` — all PR2 specs pass; PR1 specs remain green.

---

### PR2 Pre-merge Gates

- [x] G1-PR2 **lint clean**: `npm run lint` exits 0.
- [x] G2-PR2 **tests green**: `npm test` exits 0.
- [x] G3-PR2 **no `"vonex"` literal in `src/`**: `rg '"vonex"' src/` empty.
- [x] G4-PR2 **build clean**: `npm run build` exits 0.
- [x] G5-PR2 **store singleton**: verify `TutorExamsStore` is `providedIn: 'root'` and VM is NOT.
- [x] G6-PR2 **deep-link store-miss pre-test**: manually navigate directly to `/tutor/home` with a fresh session (store empty) — list loads from HTTP, not from cache. Store remains correct after load.
- [x] G7-PR2 **integration smoke** (requires learnex PR #276 running locally): login as tutor → `/tutor/home` → list renders with real exam data. Tab visibility toggle confirmed (hide tab → no requests; show tab → immediate reload). Note: this gate requires human coordination with the `feat/virtual-exam-ui` branch.

---

## PR3 — `feat: tutor exam management screen (/tutor/exams/:recordId)`

Branch: `feat/tutor-exam-management`
Targets: `testing` (stacks on PR2 merged)

### Commit 16 — `test(LR): failing specs for TutorExamDetailViewModel`

*Write failing spec first (red). This is the largest spec file in the change.*

- [x] 16.1 Create `tests/feature/LR_render/view-models/tutor-exam-detail.view-model.spec.ts`. Use `TestBed`, fakes for all 4 use-cases + `TutorExamsStore`.

  **Store resolution — warm path:**
  - Scenario store contains exam with `recordId === "rec-1"` → VM does NOT call `GetTutorExamsUseCase.execute()`; uses `classroomId` directly. Satisfies `tutor-exam-management` Requirement "TutorExamDetailViewModel — resolución de classroomId con fallback a refetch (D1)" / Scenario "Store poblado → classroomId resuelto sin request extra".

  **Store resolution — cold path (deep-link):**
  - Scenario store empty on init → VM calls `GetTutorExamsUseCase.execute()` once to hydrate store, then resolves `classroomId`. Satisfies Scenario "Store vacío en deep-link → refetch list resuelve classroomId".
  - Scenario store empty AND refetch returns list without `recordId === "rec-xxx"` → `error()` is truthy. Satisfies Scenario "recordId no encontrado ni en store ni en refetch → error".

  **Signals on successful load:**
  - Scenario both use-cases resolve → `detail()` non-null, `students()` populated, `loading()` false, `error()` null. Satisfies `tutor-exam-management` Requirement "TutorExamDetailViewModel — Signals expuestos" / Scenario "Carga exitosa popula detail y students".
  - Scenario `detail().enabledStudentIds === ["s-1","s-2"]` → `enabledStudentIds()` is `["s-1","s-2"]`. Satisfies Scenario "enabledStudentIds inicializa desde detail.enabledStudentIds".

  **Iniciar — button guard:**
  - Scenario `status === 'scheduled'` AND `enabledStudentIds().length > 0` → button enabled. Satisfies `tutor-exam-management` Requirement "Iniciar examen" / Scenario "Botón Iniciar habilitado solo con scheduled y ≥1 alumno habilitado".
  - Scenario `status === 'scheduled'` AND `enabledStudentIds().length === 0` → button disabled; `IniciarExamenUseCase` NOT called. Satisfies Scenario "Botón Iniciar deshabilitado si 0 alumnos habilitados (D5)".
  - Scenario `status === 'in_progress'` or `'finalized'` → "Iniciar" not available. Satisfies Scenario "Botón Iniciar NO aparece si status es in_progress o finalized".

  **Iniciar — success:**
  - Scenario `IniciarExamenUseCase.execute()` resolves → VM reloads detail; `actionError()` is null. Satisfies Scenario "Iniciar exitoso → status pasa a in_progress".
  - Scenario after successful `iniciar`, `store.upsert` is called with updated exam. Satisfies design.md R4 mitigation.

  **Finalizar — button guard:**
  - Scenario `status === 'in_progress'` → button enabled. Satisfies Requirement "Finalizar examen" / Scenario "Botón Finalizar habilitado solo con in_progress".
  - Scenario `status === 'scheduled'` or `'finalized'` → "Finalizar" not available. Satisfies Scenario "Botón Finalizar NO aparece si status es scheduled o finalized".

  **Finalizar — results:**
  - Scenario `{ transitioned: true }` → `actionError()` null; detail reloaded. Satisfies Scenario "Finalizar con transitioned:true — éxito normal".
  - Scenario `{ transitioned: false }` → `actionError()` null; detail reloaded (idempotent, no error). Satisfies Scenario "Finalizar con transitioned:false — idempotente, no es error".
  - Scenario after successful `finalizar`, `store.upsert` called. Satisfies design.md R4.

  **Checkboxes — enabled/disabled logic:**
  - Scenario student `hasSubmitted === true` → checkbox disabled. Satisfies Requirement "Habilitar/deshabilitar alumnos" / Scenario "Checkbox de alumno con hasSubmitted deshabilitado (D5)".
  - Scenario `status === 'finalized'` → all checkboxes disabled. Satisfies Scenario "Checkboxes deshabilitados en modo finalized (D5)".
  - Scenario toggle student `"s-3"` checked → `enabledStudentIds()` adds `"s-3"`; `ActualizarAlumnosHabilitadosUseCase.execute()` called with updated set. Satisfies Scenario "Marcar alumno habilitado — PATCH exitoso".
  - Scenario `ActualizarAlumnosHabilitadosUseCase.execute()` rejects with `ExamConflictError` → `enabledStudentIds()` reverts; `actionError()` set. Satisfies Scenario "PATCH falla — enabledStudentIds se revierte".

  **Error copy — by action:**
  - Scenario `iniciar` × `ExamPreconditionError` → `actionError()` contains message about claves/alumnos. Satisfies `tutor-exam-management` Requirement "Copy de errores por acción en español (D2)" / Scenario "Copy para iniciar × ExamPreconditionError (422)".
  - Scenario `iniciar` × `ExamConflictError` → `actionError()` about estado del examen. Satisfies Scenario "Copy para iniciar × ExamConflictError (409)".
  - Scenario `finalizar` × `ExamPreconditionError` → message about exam needing to be started first. Satisfies Scenario "Copy para finalizar × ExamPreconditionError (422)".
  - Scenario `finalizar` × `NetworkError` → message about connection; `actionError()` NOT null. Satisfies Scenario "Copy para finalizar × NetworkError".
  - Scenario `actualizarAlumnos` × `ExamConflictError` → message about submitted student. Satisfies Scenario "Copy para habilitar × ExamConflictError (409)".
  - Scenario action success after previous error → `actionError()` resets to null. Satisfies Scenario "Acción exitosa limpia actionError".
  - Scenario `actionError` logic uses `instanceof ExamPreconditionError`, NOT string comparison on `body.message`. Satisfies Scenario "Clasificador por tipo de error, NOT por body.message".

  **Network error + retry (D3):**
  - Scenario `GetTutorExamDetailUseCase.execute()` rejects with `NetworkError` → `error()` is `'network'`; retry button available. Satisfies `tutor-exam-management` Requirement "Estado de error de red + reintentar (D3 online-only)" / Scenario "Error de red en carga inicial → estado de error con botón reintentar".
  - Scenario VM is in `error()` state → calling retry method triggers reload; on success `error()` returns null. Satisfies Scenario "Reintentar dispara nueva carga".
  - Scenario action failure → nothing written to IndexedDB; nothing enqueued. Satisfies Scenario "VM NOT encola acciones fallidas (D3)".

  **Local provider:**
  - Scenario VM is NOT `providedIn: 'root'`. Satisfies `tutor-exam-management` Requirement "TutorExamDetailPage provee la VM como provider local" / Scenario "VM es local al componente page".

---

### Commit 17 — `feat(LR): TutorExamDetailViewModel`

*Make commit 16 specs green.*

- [x] 17.1 Create `src/LR_render/view-models/tutor-exam-detail.view-model.ts`. `@Injectable()` (no `providedIn`). Inject `ActivatedRoute`, `GetTutorExamDetailUseCase`, `ListClassroomStudentsUseCase`, `IniciarExamenUseCase`, `FinalizarExamenUseCase`, `ActualizarAlumnosHabilitadosUseCase`, `TutorExamsStore`.
- [x] 17.2 Implement `recordId` extraction from route params.
- [x] 17.3 Implement D1 resolution flow: `store.findByRecordId(recordId)` → hit/miss → refetch on miss → `VirtualExamNotFoundError` UX if still missing after refetch. Satisfies `tutor-exam-management` Requirement "TutorExamDetailViewModel — resolución de classroomId".
- [x] 17.4 Expose all Signals: `detail`, `students`, `loading`, `error`, `enabledStudentIds` (WritableSignal), `isSaving`, `actionError`. Satisfies Requirement "TutorExamDetailViewModel — Signals expuestos".
- [x] 17.5 Implement `iniciar()` method: guard check (button enabled only if `puedeIniciar() && enabledStudentIds().length > 0`), call use-case, on success reload detail + `store.upsert(...)`, on error set `actionError` via copy table. Satisfies Requirements "Iniciar examen" + D5 + R4.
- [x] 17.6 Implement `finalizar()` method: guard check (`puedeFinalizar()`), call use-case, handle `transitioned: true/false` (both are success, no error), reload detail + `store.upsert(...)`, on error set `actionError`. Satisfies Requirement "Finalizar examen".
- [x] 17.7 Implement `toggleStudent(studentId)` method: update `enabledStudentIds` locally, call `ActualizarAlumnosHabilitadosUseCase`, on error revert `enabledStudentIds` + set `actionError`. Satisfies Requirement "Habilitar/deshabilitar alumnos".
- [x] 17.8 Implement `actionError` copy table by action × error type using `instanceof` checks. Design.md D2 table rows for `iniciar`, `finalizar`, `actualizarAlumnosHabilitados`, `getDetail`, `listStudents`. Generic fallback for unexpected status. Satisfies Requirement "Copy de errores por acción en español (D2)".
- [x] 17.9 Implement `retry()` method (re-triggers full load sequence). No IDB or outbox. Satisfies Requirement "Estado de error de red + reintentar (D3 online-only)".
- [x] 17.10 Verify `npm run lint` clean. Commit 16 specs green.

---

### Commit 18 — `test(LR): failing specs for TutorExamDetailPage and /tutor/exams/:recordId route`

*Write failing spec first (red).*

- [x] 18.1 Create `tests/feature/LR_render/pages/tutor-exam-detail/tutor-exam-detail.page.spec.ts`. Use `TestBed` + `ComponentFixture`.
  - Scenario `TutorExamDetailViewModel` appears in page `providers`. Satisfies Requirement "TutorExamDetailPage provee la VM como provider local" / Scenario "VM es local al componente page".
  - Scenario "Iniciar" button visible when `status === 'scheduled'`. Satisfies design.md D5 UI check.
  - Scenario "Iniciar" button disabled when `enabledStudentIds().length === 0`. Satisfies Scenario "Botón Iniciar deshabilitado si 0 alumnos habilitados (D5)".
  - Scenario "Iniciar" button absent when `status === 'in_progress'` or `'finalized'`. Satisfies Scenario "Botón Iniciar NO aparece si status es in_progress o finalized".
  - Scenario "Finalizar" button visible when `status === 'in_progress'`. Satisfies Scenario "Botón Finalizar habilitado solo con in_progress".
  - Scenario "Finalizar" button absent when `status !== 'in_progress'`. Satisfies Scenario "Botón Finalizar NO aparece si status es scheduled o finalized".
  - Scenario student checkbox disabled when `hasSubmitted === true`. Satisfies Scenario "Checkbox de alumno con hasSubmitted deshabilitado (D5)".
  - Scenario all checkboxes disabled when `status === 'finalized'`. Satisfies Scenario "Checkboxes deshabilitados en modo finalized (D5)".
  - Scenario error banner + retry button visible when `error() === 'network'`. Satisfies Scenario "Error de red en carga inicial → estado de error con botón reintentar".

- [x] 18.2 In `tests/feature/LR_render/app.routes.spec.ts`: add scenarios.
  - Scenario new route `tutor/exams/:recordId` exists with `loadComponent` pointing to `TutorExamDetailPage`. Satisfies `route-protection` Requirement "Nueva ruta /tutor/exams/:recordId" / Scenario "Nueva ruta /tutor/exams/:recordId existe en la config".
  - Scenario route has `canActivate: [authGuard, roleGuard('tutor')]`. Same Requirement.
  - Scenario tutor navigates to `/tutor/exams/rec-1` → `TutorExamDetailPage` renders; VM receives `recordId === "rec-1"`. Satisfies Scenario "Tutor autenticado navega a /tutor/exams/rec-1 — renderiza gestión".
  - Scenario direct deep-link with authenticated tutor → guards pass; VM activates refetch fallback. Satisfies Scenario "Deep-link directo a /tutor/exams/:recordId — authGuard y roleGuard se aplican".
  - Scenario student trying `/tutor/exams/rec-1` → `roleGuard('tutor')` redirects. Satisfies Scenario "Alumno intenta acceder a /tutor/exams/:recordId — redirigido".
  - Scenario unauthenticated user → `authGuard` redirects to `/login`. Satisfies Scenario "Usuario no autenticado intenta /tutor/exams/:recordId — redirigido a login".
  - Scenario student routes (`/student/home`, `/student/simulacro/:id`, `/login`, legacy redirects) are unchanged. Satisfies `route-protection` Requirement "Rutas del alumno sin cambios" / Scenario "Rutas del alumno no modificadas".
  - Scenario `roleGuard('tutor')` does NOT interfere with authenticated student on `/student/home`. Satisfies Scenario "roleGuard del tutor no afecta al alumno en /student/home".

---

### Commit 19 — `feat(LR): TutorExamDetailPage + new route (/tutor/exams/:recordId)`

*Make commit 18 specs green.*

- [x] 19.1 Create `src/LR_render/pages/tutor-exam-detail/tutor-exam-detail.page.ts`. Standalone `@Component`. `providers: [TutorExamDetailViewModel]`. Template: status-conditional "Iniciar"/"Finalizar" buttons; checkbox list (disabled for `hasSubmitted` or `finalized`); error banner with retry button when `error() === 'network'`; `actionError` banner. Satisfies `tutor-exam-management` Requirements "Iniciar examen", "Finalizar examen", "Habilitar/deshabilitar alumnos", "Estado de error de red + reintentar", "TutorExamDetailPage provee la VM como provider local".
- [x] 19.2 Route `/tutor/exams/:recordId` already wired in PR2 with authGuard + roleGuard('tutor') + loadComponent. PR3 replaced the stub with the real standalone component in the same file path — no route config change needed. Satisfies `route-protection` Requirement "Nueva ruta /tutor/exams/:recordId".
- [x] 19.3 Verified existing student routes unchanged in `app.routes.ts`. Satisfies `route-protection` Requirement "Rutas del alumno sin cambios".
- [x] 19.4 Lint clean. 880 tests pass; all PR1 + PR2 + PR3 specs green.

---

### PR3 Pre-merge Gates

- [x] G1-PR3 **lint clean**: `npm run lint` exits 0.
- [x] G2-PR3 **tests green**: `npm test` exits 0.
- [x] G3-PR3 **no `"vonex"` literal in `src/`**: `rg '"vonex"' src/` empty.
- [x] G4-PR3 **build clean**: `npm run build` exits 0.
- [x] G5-PR3 **deep-link store-miss test**: navigate directly to `/tutor/exams/:recordId` with no prior `/tutor/home` visit (store empty) → VM performs one `GetTutorExamsUseCase.execute()` refetch, resolves `classroomId`, loads detail + students. Covers design.md R3.
- [x] G6-PR3 **finalize returns 200 not 202 verification**: run `finalizar()` in integration smoke; check Network tab confirms HTTP 200 with `{ transitioned, jobId? }` body. Covers design.md R2.
- [x] G7-PR3 **integration smoke** (requires learnex PR #276 running locally):
  - Login as tutor → list loads.
  - Tap exam card (scheduled, ≥1 student enabled) → management screen loads.
  - Iniciar → HTTP 204 → detail reloads to `in_progress`; list card updates (via `store.upsert`).
  - Finalizar → HTTP 200 `{ transitioned: true }` → detail reloads to `finalized`; all checkboxes and action buttons disabled.
  - Second Finalizar → HTTP 200 `{ transitioned: false }` → no error shown (idempotent).
  - Toggle student checkbox (enable) → PATCH 200 → `enabledStudentIds` updated.
  - Toggle student with `hasSubmitted === true` → checkbox remains disabled; no PATCH emitted.
  - Kill network → any action → error banner visible + retry button; nothing enqueued; reload on "Reintentar".
  - `roleGuard('tutor')` blocks student login from accessing `/tutor/exams/*`.
  - Student routes unaffected.
- [x] G8-PR3 **actionError copy verification**: verify each copy-by-action row (per design.md D2 table) appears in the VM without any `body.message` string comparison. Code review check.
- [x] G9-PR3 **student domain untouched**: `rg 'MarkingsStorage\|enqueueEnvio\|setSubmissionAck\|clearMarcaciones\|IndexedDB' src/LR_render/view-models/tutor-exam-detail.view-model.ts` returns empty. Covers D3 + design.md Non-goals.
