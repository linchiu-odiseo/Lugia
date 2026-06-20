# tutor-exam-management — Design

## Context

`tutor-exam-management` brings the tutor side of the virtual-exam flow into the Lugia PWA. Today the tutor only has `/tutor/home` with a profile header (`GET /tutor/me`) plus a "Próximamente" placeholder. The student already detects an exam opening through 120s polling (`scheduled → in_progress`), but the actor that flips that status from the device does not exist yet. This change adds it.

learnex (branch `feat/virtual-exam-ui` / PR #276, NOT yet in `develop`) exposes 6 tenant-scoped endpoints under `/t/:slug`, guarded by `examenes:read` + `examenes:write_virtual` (both already carried by the tutor JWT). The contract was verified directly against the controller and the `packages/contracts` package (engram observation #834). The design mirrors the student flow (`GET list → cards → detail screen`) but swaps marking for management actions (start / finalize / enable students).

Unlike the student — who buffers markings in a durable IndexedDB outbox — tutor actions are **online-only**. Start, finalize and enable-students are server operations with no meaningful offline queue. No outbox, no IndexedDB for this change. The change is strictly additive: it does not touch the student domain, the `credentials.interceptor`, `EnvioRetryDispatcher`, `MarkingsStorage`, IDB storage, or the student routes.

The design follows the established hexagonal layout (`L1_domain` / `L2_application` / `L3_periphery` / `LR_render`), the `InjectionToken` + `useExisting` / factory-provider wiring pattern from `app.config.ts`, the adapter + status-classifier pattern from `http-exams-api.ts`, and the Signals + 120s polling pattern from `home.view-model.ts`.

## Goals / Non-goals

**Goals**
- L1 port `TutorExamsApi` (6 methods), read-models, 4 new domain errors. The student `ExamsApi` port is NOT extended.
- L3 adapter `HttpTutorExamsApi` with error classification by **HTTP status** (never by prose `message`) and DTO camelCase → domain mapping (`string → Date`, nullable `count`/`courseId`).
- 6 pure L2 use-cases (constructor injection, `execute()`, errors propagated as-is).
- A root-singleton shared list store (`TutorExamsStore`) so the detail screen resolves `classroomId` without a backend change, with a cold deep-link refetch fallback.
- Two view-models / pages: list (`/tutor/home`) with 120s polling, and management (`/tutor/exams/:recordId`) with start / finalize / enable students.
- Error copy chosen **by action** in the view-model (which knows the action), disambiguating shared-status sub-cases (two 409s, two 422s) without parsing backend prose.
- Defense-in-depth UI guards paired with backend 422/409.

**Non-goals**
- Creating a virtual exam or uploading the PDF (done in web-tenant; the tutor here MANAGES existing records).
- Archiving an exam (`finalized → archived`): no endpoint consumed here.
- Force-close / administrative closure of student submissions.
- Any outbox / offline queue for tutor actions (online-only by design — D3).
- Telemetry of tutor actions; push notification to the student (the student already detects via polling).
- Optimistic UI / sophisticated multi-tutor locking. Concurrency is resolved server-side by state (409) + a client refetch (R1).

## Decisions

### D1: `classroomId` resolution via a root-singleton shared list store (`TutorExamsStore`)

**Chosen.** A root-singleton injectable `TutorExamsStore` (`providedIn: 'root'`) that holds the last fetched list and exposes a read API for the detail VM.

```ts
// src/LR_render/state/tutor-exams.store.ts  (LR-level service)
@Injectable({ providedIn: 'root' })
export class TutorExamsStore {
  private readonly _exams = signal<readonly TutorExam[]>([]);
  readonly exams = this._exams.asReadonly();

  setExams(exams: readonly TutorExam[]): void { this._exams.set(exams); }
  findByRecordId(recordId: string): TutorExam | null {
    return this._exams().find((e) => e.recordId === recordId) ?? null;
  }
  upsert(exam: TutorExam): void { /* replace by recordId or append */ }
  clear(): void { this._exams.set([]); }
}
```

**Problem.** `GET /virtual-exams/:recordId` (detail, endpoint 2) returns `enabledStudentIds` but **NOT** `classroomId` / `entryId` — only the LIST (endpoint 1) carries them. The students endpoint (3) needs `classroomId` in the path and `virtualExamDetailId` (the list/detail `id`, NOT the `recordId`) as a query param. So the detail screen must obtain `classroomId` from somewhere the URL does not provide.

**Resolution flow.**
1. `TutorExamsListViewModel.refresh()` fetches the list (`GetTutorExamsUseCase`) and on every successful poll calls `store.setExams(list)`.
2. `TutorExamDetailViewModel.start(recordId)` reads `store.findByRecordId(recordId)`:
   - **Hit** (warm navigation from the list) → `classroomId` + `detailId` resolved synchronously, zero extra calls.
   - **Miss** (cold deep-link / hard refresh, store empty) → the detail VM calls `GetTutorExamsUseCase.execute()` **once** to hydrate the store (`store.setExams(list)`), then re-reads `findByRecordId(recordId)`. One cheap GET. If still missing after refetch → `VirtualExamNotFoundError` UX (the exam is not in any classroom this tutor owns).
3. With `classroomId` + `detailId` in hand, the detail VM calls `GetTutorExamDetailUseCase` (enabledStudentIds + status) and `ListClassroomStudentsUseCase({ classroomId, virtualExamDetailId: detailId })`.

**Where it lives and why.** The store is an **LR-level service** (`src/LR_render/state/`), not L3. Rationale: it holds **domain read-models** (`TutorExam[]`) as UI state shared between two view-models — it is render-layer state coordination, not an I/O adapter. L3 is for ports' implementations (HTTP, storage, clock); a store with no port interface and no external boundary belongs to LR alongside the view-models that own it. It is `providedIn: 'root'` (singleton) so it survives navigation between the list page (page-local VM) and the detail page (page-local VM) — the two VMs are provider-local, but the store they share must outlive both.

**Alternatives.**
(a) Put `classroomId` in the route (`/tutor/exams/:classroomId/:recordId`). Rejected: leaks an internal id into the URL, breaks symmetry with `/student/simulacro/:id`, and the detail endpoint still does not return it so deep-link to a clean URL would be impossible anyway. (b) Always refetch the list in the detail VM (no store). Rejected: an extra GET on every warm navigation from the list, wasteful when the data is already in memory. (c) Backend change to add `classroomId` to the detail response. Rejected: out of scope for the PWA change; the store solves it client-side with no backend coordination.

**Consequences.** Deep-link safe with one fallback GET. The detail VM must also `store.upsert(...)` after a successful start/finalize so the list reflects the new status without waiting for the next poll (see R4). The store is intentionally dumb (no fetching of its own) — VMs own the I/O; the store only holds and reads.

### D2: Error classification by HTTP STATUS (L3), error copy by ACTION (VM)

**Chosen.** The L3 adapter classifies every failure into a domain error **by HTTP status only**; the view-model picks the Spanish user-facing copy by **which action failed** combined with the domain error type. The adapter never reads `body.message`.

**Why.** Per observation #834, the backend does NOT emit granular codes like the student flow (`STUDENT_NOT_LINKED`). It returns generic `code` (`forbidden`, `not_found`, `conflict`, `unprocessable_entity`, …) and the only discriminator of sub-cases lives in a prose `message` (sometimes English with UUIDs): two distinct 409 cases (`'...already submitted and cannot be removed...'` vs `'...frozen once the exam is finalized'`) and two distinct 422 cases (`'Configurá las claves...'` vs `'Cannot start... with 0 enabled students'`). Matching prose is brittle (the back can reword it, mix languages, embed UUIDs). Instead: **the VM already knows the action context** — it is the code path calling `iniciar` vs `finalizar` vs `actualizarAlumnos`. So a 422 from `iniciar` means "0 students / keys not configured" and a 409 from `actualizarAlumnos` means "frozen / already submitted". The action disambiguates the shared status without ever reading `message`. This is the exact pattern `http-exams-api.ts` already uses (classify by status; the documented `message`-reading exceptions there are closed enums of control codes, which the tutor backend does NOT provide, so we read `message` ZERO times here).

**L3 status → domain error map** (in `classifyTutorError`):

| HTTP status | Domain error |
|---|---|
| 400 | `InvalidPayloadError` (reused) |
| 403 | `TutorExamForbiddenError` |
| 404 | `VirtualExamNotFoundError` |
| 409 | `ExamConflictError` |
| 422 | `ExamPreconditionError` |
| 0 / 429 / 5xx / timeout | `NetworkError` (reused) |

401 is absorbed by `credentials.interceptor` (refresh + redirect), as everywhere else.

**VM copy-by-action table** (rows = use-case, columns = domain error → exact Spanish message shown to the tutor):

| Use-case (action) | `ExamConflictError` (409) | `ExamPreconditionError` (422) | `VirtualExamNotFoundError` (404) | `TutorExamForbiddenError` (403) | `NetworkError` |
|---|---|---|---|---|---|
| `iniciar` (start) | "El examen ya cambió de estado. Actualizá la pantalla e intentá de nuevo." | "No se puede iniciar: configurá las claves y habilitá al menos un alumno antes de iniciar el examen." | "Este examen ya no está disponible." | "No tenés permiso para operar este examen." | "Sin conexión. Revisá tu red y reintentá." |
| `finalizar` (finalize) | "El examen ya cambió de estado. Actualizá la pantalla e intentá de nuevo." | "No se puede finalizar un examen que todavía no fue iniciado. Iniciálo primero." | "Este examen ya no está disponible." | "No tenés permiso para operar este examen." | "Sin conexión. Revisá tu red y reintentá." |
| `actualizarAlumnosHabilitados` (enable) | "No se pueden cambiar los alumnos: el set está congelado o un alumno ya entregó." | "Configuración de alumnos inválida. Revisá la selección." | "Este examen ya no está disponible." | "No tenés permiso para operar este examen." | "Sin conexión. Revisá tu red y reintentá." |
| `getDetail` (load detail) | — | — | "Este examen ya no está disponible." | "No tenés permiso para ver este examen." | "Sin conexión. Revisá tu red y reintentá." |
| `getList` (load list) | — | — | — | "No tenés permiso para ver tus exámenes." | "Sin conexión. Revisá tu red y reintentá." |
| `listStudents` (load roster) | — | — | "El aula del examen ya no está disponible." | "No tenés permiso para ver los alumnos de este examen." | "Sin conexión. Revisá tu red y reintentá." |

Cells marked "—" are statuses the backend does not emit for that endpoint; if one ever appears, the VM falls back to a generic "Ocurrió un error. Reintentá." rather than crashing.

**Alternatives.** (a) Read `message` and string-match sub-cases in L3. Rejected: brittle to backend rewording, mixed languages, embedded UUIDs; couples the adapter to human prose. (b) Surface the raw backend `message` directly to the tutor. Rejected: some messages are English developer prose with UUIDs — unfit for end users.

**Consequences.** Robust to backend copy changes. The VM is the single source of user-facing Spanish copy; the adapter stays prose-agnostic. Adding a new action only adds a row to the VM table, never touches the L3 classifier.

### D3: Online-only — no outbox / IndexedDB for tutor actions

**Chosen.** Tutor actions are never queued. A `NetworkError` produces a visible error state + retry button; nothing is persisted locally.

**Contrast with the student.** The student buffers markings in a durable IDB outbox (`MarkingsStorage` + `OutboxStoragePort` + `EnvioRetryDispatcher`) because a marking is the student's own irreplaceable work and connectivity during an exam is unreliable. A tutor's start/finalize/enable is a **server state transition**, not user content: queuing "start this exam in 3 minutes when the network returns" is semantically wrong — by then the situation may have changed, and a stale queued start could open an exam the tutor no longer wants open. The right behavior on no-network is to fail loudly and let the tutor retry deliberately. This keeps the change strictly additive: zero new IDB stores, zero new dispatchers, zero coupling to the student's outbox machinery.

**Consequences.** No durability for tutor actions (acceptable — they are idempotent-ish server transitions the tutor re-triggers). No `AbortSignal` / inflight cancellation needed. Rollback is a clean revert with no migration.

### D4: Routing — `/tutor/home` IS the list, `/tutor/exams/:recordId` is management

**Chosen.** `/tutor/home` becomes the list (replacing the placeholder); `/tutor/exams/:recordId` is the management screen. Both lazy-loaded under `[authGuard, roleGuard('tutor')]`.

**Why `/tutor/home` is the list.** Mirror of the student: `/student/home` IS the list, not `/student/exams`. `roleGuard('tutor')` already redirects a tutor landing on a student route to `/tutor/home`. If the list lived at a separate `/tutor/exams`, the guard would land the tutor on `/tutor/home` (placeholder) and then need a second redirect to `/tutor/exams` — a double redirect for no benefit. Collapsing the list onto `/tutor/home` makes the guard target a valid, useful destination in one hop. The existing `tutor/home` route entry swaps its `loadComponent` from `TutorHomePage` (placeholder) to `TutorExamsListPage`.

**Why a clean `/tutor/exams/:recordId`.** Symmetric to `/student/simulacro/:id`. `recordId` is the id every other endpoint uses (start/finalize/detail/enable). It is deep-link safe thanks to D1 (the store + refetch resolves `classroomId`). The page provides its VM locally (`providers: [TutorExamDetailViewModel]`) so each mount starts clean, exactly like `HomePage` provides `HomePageViewModel`.

**Alternatives.** (a) Separate `/tutor/exams` list route. Rejected: double redirect via the role guard. (b) `classroomId` in the URL (`/tutor/exams/:classroomId/:recordId`). Rejected — see D1(a).

**Consequences.** `route-protection` capability gets a MINOR, non-breaking update (`/tutor/home` now loads the list, new `/tutor/exams/:recordId`). No change to student routes.

### D5: Defense-in-depth UI guards paired with backend 422/409

**Chosen.** The UI proactively disables actions that the backend would reject, AND still handles the backend error as a fallback.

| UI guard | Backend it pairs with |
|---|---|
| "Iniciar" button disabled when 0 enabled students (`enabledStudentIds.length === 0`) | 422 `'Cannot start a virtual exam with 0 enabled students'` |
| Student checkbox disabled when `hasSubmitted === true` (can't un-toggle) | 409 `'Student <uuid> has already submitted and cannot be removed...'` |
| Whole management screen read-only when `status === 'finalized'` (`estaFinalizado()`) | 409 `'The enabled student set is frozen once the exam is finalized'` |
| "Iniciar" shown only when `puedeIniciar()` (`scheduled`); "Finalizar" only when `puedeFinalizar()` (`in_progress`) | 422 `'Cannot finalize a scheduled exam — start it first'` |

**Why both layers.** The UI guard is for UX (the tutor never wastes a tap on an action that will fail, and the reason is visible inline). The backend handling is the source of truth for correctness and for races (another tutor changed the state between this tutor's render and tap — D5 UI guard was computed on stale data, the 409/422 catches it). Belt and suspenders: the UI guard prevents the common case; the error path covers the concurrent / stale case (R1). The domain helpers (`puedeIniciar()`, `puedeFinalizar()`, `estaFinalizado()`) live on the `TutorExam` read-model so both the card and the detail screen compute state from the same source.

**Consequences.** The "0 students disables Iniciar" guard recomputes reactively (Signals) whenever the enabled set changes, so re-enabling a student instantly re-enables the button.

### D6: File structure (exact new paths per layer)

So `sdd-tasks` can slice mechanically and align with the 3-PR plan. **New** files unless noted; modified files marked `(modify)`.

**L1 domain**
- `src/L1_domain/ports/tutor-exams-api.ts` — port `TutorExamsApi` (6 methods) + request/result types (`UpdateEnabledStudentsRequest`, `ListClassroomStudentsRequest`, `FinalizeResult`).
- `src/L1_domain/entities/tutor-exam.ts` — read-model `TutorExam` (with `puedeIniciar()`, `puedeFinalizar()`, `estaFinalizado()`).
- `src/L1_domain/value-objects/tutor-exam-detail.ts` — read-model `TutorExamDetail` (`enabledStudentIds`, no `classroomId`/`entryId`).
- `src/L1_domain/value-objects/classroom-student.ts` — VO `ClassroomStudent`.
- `src/L1_domain/errors/virtual-exam-not-found.error.ts` — `VirtualExamNotFoundError` (404).
- `src/L1_domain/errors/exam-conflict.error.ts` — `ExamConflictError` (409).
- `src/L1_domain/errors/exam-precondition.error.ts` — `ExamPreconditionError` (422).
- `src/L1_domain/errors/tutor-exam-forbidden.error.ts` — `TutorExamForbiddenError` (403).
- Reuses `ExamServerStatus`, `NetworkError`, `InvalidPayloadError` (no change).

**L2 application** (pure classes, constructor injection, `execute()`)
- `src/L2_application/use-cases/get-tutor-exams.use-case.ts` — `GetTutorExamsUseCase`.
- `src/L2_application/use-cases/get-tutor-exam-detail.use-case.ts` — `GetTutorExamDetailUseCase` (`execute({ recordId })`).
- `src/L2_application/use-cases/list-classroom-students.use-case.ts` — `ListClassroomStudentsUseCase` (`execute({ classroomId, virtualExamDetailId })`).
- `src/L2_application/use-cases/iniciar-examen.use-case.ts` — `IniciarExamenUseCase` (`execute({ recordId })`).
- `src/L2_application/use-cases/finalizar-examen.use-case.ts` — `FinalizarExamenUseCase` (`execute({ recordId }): Promise<FinalizeResult>`).
- `src/L2_application/use-cases/actualizar-alumnos-habilitados.use-case.ts` — `ActualizarAlumnosHabilitadosUseCase` (`execute({ recordId, enabledStudentIds })`).

**L3 periphery**
- `src/L3_periphery/http/api-paths.ts` `(modify)` — add `tutorVirtualExams()`, `virtualExam(recordId)`, `classroomStudents(classroomId, virtualExamDetailId)`, `virtualExamEnabledStudents(recordId)`, `virtualExamStart(recordId)`, `virtualExamFinalize(recordId)`. All with `encodeURIComponent`.
- `src/L3_periphery/http/http-tutor-exams-api.ts` — `HttpTutorExamsApi implements TutorExamsApi` + `classifyTutorError` + DTO → domain mapping.
- `src/L3_periphery/tokens.ts` `(modify, optional)` or `app.config.ts` `(modify)` — `TUTOR_EXAMS_API` token.

**LR render**
- `src/LR_render/state/tutor-exams.store.ts` — `TutorExamsStore` (root singleton, D1).
- `src/LR_render/view-models/tutor-exams-list.view-model.ts` — `TutorExamsListViewModel` (polling, store publish, profile header reuse).
- `src/LR_render/view-models/tutor-exam-detail.view-model.ts` — `TutorExamDetailViewModel` (store resolve + refetch fallback, actions, copy-by-action).
- `src/LR_render/pages/tutor-exams-list/tutor-exams-list.page.ts` (+ template) — replaces the placeholder at `/tutor/home`.
- `src/LR_render/pages/tutor-exam-detail/tutor-exam-detail.page.ts` (+ template) — `/tutor/exams/:recordId`.
- `src/LR_render/app.routes.ts` `(modify)` — point `tutor/home` at `TutorExamsListPage`, add `tutor/exams/:recordId`.
- `src/app.config.ts` `(modify)` — `TUTOR_EXAMS_API` binding + 6 use-case factory providers.
- The old `src/LR_render/pages/tutor-home/tutor-home.page.ts` placeholder is superseded (removed or left orphaned — `sdd-tasks` decides; route stops referencing it).

### D7: DI wiring — `TUTOR_EXAMS_API` token + `useExisting` + 6 use-case factory providers

**Chosen.** Exactly the `app.config.ts` pattern already in use for the student side.

```ts
export const TUTOR_EXAMS_API = new InjectionToken<TutorExamsApi>('TUTOR_EXAMS_API');

// Bind port L1 → impl L3 (singleton, providedIn:'root' on the class).
{ provide: TUTOR_EXAMS_API, useExisting: HttpTutorExamsApi },

// One factory provider per use-case; all 6 depend only on [TUTOR_EXAMS_API].
{ provide: GetTutorExamsUseCase,             useFactory: (api) => new GetTutorExamsUseCase(api),             deps: [TUTOR_EXAMS_API] },
{ provide: GetTutorExamDetailUseCase,        useFactory: (api) => new GetTutorExamDetailUseCase(api),        deps: [TUTOR_EXAMS_API] },
{ provide: ListClassroomStudentsUseCase,     useFactory: (api) => new ListClassroomStudentsUseCase(api),     deps: [TUTOR_EXAMS_API] },
{ provide: IniciarExamenUseCase,             useFactory: (api) => new IniciarExamenUseCase(api),             deps: [TUTOR_EXAMS_API] },
{ provide: FinalizarExamenUseCase,           useFactory: (api) => new FinalizarExamenUseCase(api),           deps: [TUTOR_EXAMS_API] },
{ provide: ActualizarAlumnosHabilitadosUseCase, useFactory: (api) => new ActualizarAlumnosHabilitadosUseCase(api), deps: [TUTOR_EXAMS_API] },
```

`TutorExamsStore` needs no provider entry — it is `@Injectable({ providedIn: 'root' })`. The two VMs are provided locally by their pages (`providers: [VM]`), mirroring `HomePageViewModel`. `HttpTutorExamsApi` is `@Injectable({ providedIn: 'root' })`, bound via `useExisting` (same as `HttpExamsApi`).

**Consequences.** PR1 (foundation) wires the token + all 6 providers but nothing injects the use-cases yet → compiles in isolation, runtime-inert. PR2/PR3 wire the VMs and pages that consume them.

### D8: Testing approach — STRICT TDD with Vitest

**Chosen.** Test-first, mirroring the existing suite layout. Specs live where the layer's existing specs live:

| Layer | What to test | Approach | Location |
|---|---|---|---|
| L2 use-cases | Each `execute()` delegates to the right port method with the right args; errors propagate as-is; `FinalizarExamenUseCase` returns `FinalizeResult` shape | Pure Vitest with `FakeTutorExamsApi` | `tests/unit/L2_application/` |
| L1 mapping (via adapter) | DTO camelCase → domain, `string → Date`, nullable `count`/`courseId` → null, `ExamServerStatus` construction | Covered in the adapter feature tests | (see below) |
| L3 HTTP adapter | URL built from `apiPath.*`; correct verb/body; **each row of the D2 status table** (403→Forbidden, 404→NotFound, 409→Conflict, 422→Precondition, 0/429/5xx/timeout→Network); finalize 200 `{ transitioned, jobId? }` shape; start 204 void; enable-students 200 void; mapping with null `count`/`courseId` | Vitest + `TestBed` + `HttpTestingController` (mirrors `http-exams-api` tests) | `tests/feature/L3_periphery/http/` |
| LR list VM | Polling 120s with fake timers (pause when tab hidden); successful refresh publishes to `TutorExamsStore`; error-by-status routes to the right state | Vitest + `TestBed`, fake `TutorExamsStore` + fake use-cases, `vi.useFakeTimers()` | `tests/feature/LR_render/view-models/` |
| LR detail VM | Store **hit** resolves `classroomId` with zero extra calls; store **miss** (empty) refetches the list once then resolves; copy-by-action for each (action × error) cell; UI guards (0 students disables Iniciar, `hasSubmitted` disables checkbox, finalized read-only); `store.upsert` after successful start/finalize | Vitest + `TestBed`, fakes | `tests/feature/LR_render/view-models/` |

**New shared fake.** `FakeTutorExamsApi` added to `tests/unit/L2_application/fakes.ts` (the existing fakes module) implementing `TutorExamsApi` with recordable calls + programmable return/throw, reused by L2 and LR VM tests. The L3 adapter does NOT use the fake — it uses `HttpTestingController` against the real `HttpClient` to assert the wire contract.

**TDD order per PR.** Write the failing spec → minimal impl → green → refactor. PR1: port type + use-case specs + adapter specs first. PR2: list VM specs (polling + store publish). PR3: detail VM specs (resolve/refetch + copy-by-action + guards).

## Interfaces / Contracts

```ts
// L1: src/L1_domain/ports/tutor-exams-api.ts
export interface FinalizeResult { transitioned: boolean; jobId?: string; }

export interface TutorExamsApi {
  getTutorExams(): Promise<readonly TutorExam[]>;
  getExamDetail(recordId: string): Promise<TutorExamDetail>;
  listClassroomStudents(req: { classroomId: string; virtualExamDetailId: string }): Promise<readonly ClassroomStudent[]>;
  updateEnabledStudents(req: { recordId: string; enabledStudentIds: readonly string[] }): Promise<void>;
  iniciar(recordId: string): Promise<void>;
  finalizar(recordId: string): Promise<FinalizeResult>;
}
```

## DTO → domain mapping note

Tutor responses are **camelCase** (unlike the student submit, which is snake_case). The adapter maps:
- `id` → `detailId`, `recordId` → `recordId` (the id used by every other endpoint), `classroomId`, `entryId` (list only).
- `status` (`scheduled | in_progress | finalized`) → `new ExamServerStatus(status)` (reused VO; the list never emits `archived`, the detail may).
- `startedAt | null`, `finishedAt | null`, `createdAt` → `string → Date` with `Number.isNaN(d.getTime())` validation (same guard as `http-exams-api.toExam`); null stays null.
- `count: number | null` and `courseId: string | null` → kept nullable on the read-model; the UI renders `"—"`.
- `duration` is **seconds**; formatting is a UI concern.
- `finalize` body `{ transitioned, jobId? }` maps straight to `FinalizeResult`.

## Risks / Trade-offs

### R1 — Multi-tutor concurrent edits

Two tutors operate the same exam. Tutor A's UI was rendered on state computed before Tutor B's action. The D5 UI guards were therefore computed on stale data.

**Mitigation.** The backend resolves by state: A's now-invalid action returns 409 (`ExamConflictError`). The detail VM catches it, shows the conflict copy (D2), and refetches the detail (and refreshes the store) so A's screen reflects the real current state. No CRDT, no locking — server-state + refetch is the contract (proposal "Out of scope").

### R2 — `finalize` returns 200, not 202/204 (controller comment is wrong)

The controller comment claims 202 but the implementation returns **200 with `{ transitioned, jobId? }`** (observation #834). Treating it as 202/204 would discard the body and lose the idempotency signal.

**Mitigation.** The adapter spec asserts the exact 200 + body shape. The VM reads `transitioned`: `true` → "Finalizado"; `false` (second finalize, already finalized) → no error, idempotent no-op message. Locked in by an adapter test.

### R3 — Deep-link store-miss (cold navigation, store empty)

A tutor opens `/tutor/exams/:recordId` directly (bookmark, refresh) with no list in memory → no `classroomId`, so the students endpoint can't be called.

**Mitigation (D1).** The detail VM detects the empty store, refetches the list once (`GetTutorExamsUseCase`), hydrates the store, and re-resolves. Mandatory test: "store empty → refetch → resolve". If still unresolved after refetch → `VirtualExamNotFoundError` UX.

### R4 — Stale list after a start/finalize action

After the tutor starts or finalizes from the detail screen, the list (if still in the store) shows the OLD status. The student would see the new status on their next poll, but the tutor's own list would lag until its 120s poll.

**Mitigation.** On a successful start/finalize, the detail VM calls `store.upsert(updatedExam)` (or refetches the detail and updates the store entry) so the list reflects the new status immediately on back-navigation. Covered by a detail-VM test asserting `store.upsert` is invoked after a 204 start / 200 finalize-transitioned.

### R5 — `count` / `courseId` null break rendering

`count` is null until the exam starts; `courseId` can be null.

**Mitigation.** Read-models type them `number | null` / `string | null`; the UI renders `"—"`. A mapping test asserts null → null (no `0`, no `""`).

### R6 — Polling adds tutor-side load

The tutor list polls every 120s like the student.

**Mitigation.** Identical pattern to `home.view-model` (120s, paused when the tab is hidden via `visibilitychange`). No infra change. Page-local VM so timers are torn down on unmount (`stop()`).

## Migration / Rollout

- **No data migration.** No new IDB store, no env flag (online-only, no feature gate needed).
- **3 PRs, each ≤400 lines, STRICT TDD:** (1) foundation L1+L2+L3 + token/wiring + `FakeTutorExamsApi`, compiles isolated and runtime-inert; (2) list page `/tutor/home` + VM + polling + `TutorExamsStore`; (3) management page `/tutor/exams/:recordId` + VM + actions + copy-by-action + read-only/disabled states.
- **Rollback.** Strictly additive: `git revert` of the merge commits removes everything with no migration. Reverting PR2/PR3 leaves PR1 inert (nobody injects the use-cases).
- **Dependency.** learnex `feat/virtual-exam-ui` / PR #276 must be running locally for integration (the 6 endpoints are not in `develop` yet). Human coordination.

## Open Questions

None. The contract (6 endpoints, status codes, finalize 200 shape, null fields, no granular error codes) is verified against PR #276 (observation #834). The `classroomId` resolution, error-copy strategy, routing, and online-only stance are settled in D1–D8.
