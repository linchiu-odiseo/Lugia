# Tasks — fase-3-exam-list-learnex

## Preamble

This change ships as a **single PR with 7 sequential commits** (≤8 files each). Commits 1–6 compile in isolation and pass lint; tests are intentionally broken until commit 7 is applied. The PR merges to `master` only when all 7 commits pass CI together, and `hexagonal-guard` has signed off.

Sub-agent channels: commits 1, 2, 3, 4, 6 are mechanical TypeScript — implementable inline or by a general-purpose agent. **Commit 5 → delegate to `frontend-builder`**. **Commit 7 → delegate to `test-engineer`**. Post-commit-5, pre-merge **→ delegate to `hexagonal-guard`** for a read-only boundary audit.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 7 commits in 1 PR; if CI blocks on size, split 7a (commits 1–4+6) / 7b (commit 5) / 7c (commit 7) |
| Delivery strategy | single-pr (all commits green together before merge) |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | L1+L2+L3+infra renames (commits 1–4, 6) | PR 1 or first slice | Compiles; tests broken; lint clean |
| 2 | LR view-models + pages (commit 5) | PR 2 / same PR | Depends on unit 1 |
| 3 | Test reshape (commit 7) | PR 3 / same PR | Green CI; hexagonal-guard gate |

---

## Commit 1 — `feat(L1): rename Simulacro→Exam + reshape entity + ExamServerStatus VO`

Agent: general-purpose

- [ ] 1.1 `git mv src/L1_domain/entities/simulacro.ts src/L1_domain/entities/exam.ts` — satisfies `offline-storage` Scenario "Marcacion construida con examId" (entity rename precondition).
- [ ] 1.2 In `src/L1_domain/entities/exam.ts`: rename class `Simulacro → Exam`; replace constructor params: drop `fin: Date`; add `duration: number` (≥ 1 s invariant), `course: string | null`, `type: string` (≤10 chars), `started: Date | null`, `finished: Date | null`; rename `inicio → scheduled`; keep `area: string | null` (D7). Satisfies `exam-list` Requirement "Entidad Exam".
- [ ] 1.3 In `src/L1_domain/entities/exam.ts`: replace `fin > inicio` invariant with `duration >= 1`; throw `InvalidExamError` on violation. Satisfies `exam-list` Requirement "Entidad Exam" (invariant).
- [ ] 1.4 `git mv src/L1_domain/value-objects/estado-simulacro.ts src/L1_domain/value-objects/exam-server-status.ts` — rename precondition.
- [ ] 1.5 In `src/L1_domain/value-objects/exam-server-status.ts`: rename class `EstadoSimulacro → ExamServerStatus`; values `'scheduled' | 'in_progress' | 'finalized'`; `permiteEntrada()` returns `true` only for `'in_progress'`; `esTerminal()` returns `true` for `'finalized'`. Satisfies `exam-list` Scenarios "permiteEntrada", "esTerminal".
- [ ] 1.6 `git mv src/L1_domain/errors/invalid-simulacro.error.ts src/L1_domain/errors/invalid-exam.error.ts`; rename class `InvalidSimulacroError → InvalidExamError`. Satisfies `exam-list` Scenario "Dato de bug — started null".
- [ ] 1.7 In `src/L1_domain/ports/simulacros-api.ts` → `git mv` to `src/L1_domain/ports/exams-api.ts`: rename interface `SimulacrosApi → ExamsApi`; update `ExamsListResult { exams: Exam[]; serverTime: Date }`; rename `EnvioRequest.simulacroId → examId`. Satisfies `exam-list` Requirement "GetTodaysExamsUseCase".
- [ ] 1.8 In `src/L1_domain/entities/marcacion.ts`: rename field `simulacroId → examId`. Satisfies `offline-storage` Scenario "Marcacion construida con examId".
- [ ] 1.9 In `src/L1_domain/ports/markings-storage.ts`: rename all `simulacroId` parameters to `examId`; add method signature `hasSubmittedAck(examId: string): Promise<boolean>` (no impl here). Satisfies `exam-list` Requirement "Composición de estado-tarjeta" (D4 port seam).
- [ ] 1.10 Verify `npm run lint` passes (no runtime execution needed; compile errors in upper layers are expected until commit 6).

---

## Commit 2 — `feat(L1): add new error classes`

Agent: general-purpose

- [ ] 2.1 Create `src/L1_domain/errors/exams-permission-revoked.error.ts`: `export class ExamsPermissionRevokedError extends Error { name = 'ExamsPermissionRevokedError'; }`. Satisfies `exam-list` Scenario "403 cuando los permisos fueron revocados".
- [ ] 2.2 Create `src/L1_domain/errors/student-not-linked.error.ts`: `export class StudentNotLinkedError extends Error { name = 'StudentNotLinkedError'; }`. Satisfies `exam-list` Scenario "404 con code STUDENT_NOT_LINKED".
- [ ] 2.3 Create `src/L1_domain/errors/submission-not-available.error.ts`: `export class SubmissionNotAvailableError extends Error { name = 'SubmissionNotAvailableError'; }` — MUST NOT extend `NetworkError`. Satisfies `exam-submission` Scenario "SubmissionNotAvailableError no es instancia de NetworkError" (D6).
- [ ] 2.4 In `src/L1_domain/errors/errors.spec.ts` (or create adjacent new file if no index exists): add constructor + instanceof test for each of the 3 new errors; include explicit `expect(new SubmissionNotAvailableError() instanceof NetworkError).toBe(false)`. Satisfies `exam-submission` Requirement "SubmissionNotAvailableError como clase independiente".
- [ ] 2.5 Verify `npm run lint` passes.

---

## Commit 3 — `feat(L2): rename use cases + propagate examId + fix duration math`

Agent: general-purpose

- [ ] 3.1 `git mv src/L2_application/use-cases/obtener-simulacros-del-dia.use-case.ts src/L2_application/use-cases/get-todays-exams.use-case.ts`; rename class `ObtenerSimulacrosDelDiaUseCase → GetTodaysExamsUseCase`. Satisfies `exam-list` Requirement "GetTodaysExamsUseCase".
- [ ] 3.2 In `src/L2_application/use-cases/get-todays-exams.use-case.ts`: update port reference from `SimulacrosApi → ExamsApi`; return type `ExamsListResult`. Satisfies `exam-list` Scenarios "Lista no vacía", "Lista vacía".
- [ ] 3.3 In `src/L2_application/use-cases/marcar-respuesta.use-case.ts`: rename all occurrences of `simulacroId → examId` in parameters, local variables, and `MarkingsStorage` calls. Satisfies `offline-storage` Requirement "Rename de campo simulacroId a examId".
- [ ] 3.4 In `src/L2_application/use-cases/enviar-simulacro.use-case.ts`: rename `simulacroId → examId`; ensure `catch (NetworkError)` block has explicit `instanceof` check that excludes `SubmissionNotAvailableError` (guard: `if (err instanceof NetworkError && !(err instanceof SubmissionNotAvailableError))`). Satisfies `exam-submission` Scenario "EnviarSimulacroUseCase no encola SubmissionNotAvailableError".
- [ ] 3.5 In `src/L2_application/use-cases/programar-auto-envio.use-case.ts`: rename `simulacroId → examId`; fix timer math to `exam.started.getTime() + exam.duration * 1000` (when `'in_progress'` + `started !== null`), fallback `exam.scheduled.getTime() + exam.duration * 1000`. Factor is ×1000 (seconds → ms), NOT ×60000. Satisfies `exam-list` Requirement "Cálculo correcto del tiempo de cierre".
- [ ] 3.6 In `src/L2_application/use-cases/retomar-envios-pendientes.use-case.ts`: rename `simulacroId → examId` in all parameter references. Satisfies `offline-storage` Requirement "Rename".
- [ ] 3.7 Verify `npm run lint` passes.

---

## Commit 4 — `feat(L3): http-exams-api adapter + api-paths helper + IDB hasSubmittedAck stub`

Agent: general-purpose

- [ ] 4.1 `git mv src/L3_periphery/http/http-simulacros-api.ts src/L3_periphery/http/http-exams-api.ts`; rename class `HttpSimulacrosApi → HttpExamsApi implements ExamsApi`. Satisfies `exam-list` Requirement "Adapter".
- [ ] 4.2 In `src/L3_periphery/http/api-paths.ts`: add method `studentExamSessions(): string` → `/t/${this.slug}/student/exam-sessions`. Satisfies `exam-list` Requirement "URL via apiPath.studentExamSessions()".
- [ ] 4.3 In `src/L3_periphery/http/http-exams-api.ts`: implement GET `studentExamSessions()` using `HttpClient`; map DTO fields directly to `Exam` constructor (no Spanish translation); do NOT add `withCredentials` here (handled by `credentials.interceptor`). Satisfies `exam-list` Scenario "Lista no vacía con exámenes del día".
- [ ] 4.4 In `src/L3_periphery/http/http-exams-api.ts`: DTO resilience filter — if `dto.status === 'in_progress' && dto.started === null`, emit `console.warn('[ExamsApi] Skipping malformed exam', { id: dto.id, reason: 'in_progress without started' })` and EXCLUDE that item from the resulting `Exam[]` list (skip silencioso per D3). Otros items válidos se devuelven normalmente. Satisfies `exam-list` Scenario "Dato de bug — started null con serverStatus in_progress (skip silencioso)".
- [ ] 4.5 In `src/L3_periphery/http/http-exams-api.ts`: error classification per `(status, endpoint, code)` — 403 → `ExamsPermissionRevokedError`; 404 + `code === 'STUDENT_NOT_LINKED'` → `StudentNotLinkedError`; 404 without that code → `NetworkError`; 0/5xx → `NetworkError`; 429 → `NetworkError`. Satisfies `exam-list` Scenarios "403", "404+code", "404 sin code", "429".
- [ ] 4.6 In `src/L3_periphery/http/http-exams-api.ts`: `enviar()` method — synchronous `throw new SubmissionNotAvailableError()`, zero HTTP calls. Satisfies `exam-submission` Scenario "POST enviar lanza error sin llamada HTTP".
- [ ] 4.7 In `src/L3_periphery/storage/indexed-db-markings-storage.ts`: rename all `simulacroId` parameter names to `examId` (IDB key strings retain `"simulacro"` segment — do NOT change string literals); add `hasSubmittedAck(examId: string): Promise<boolean>` returning `Promise.resolve(false)` with a `// TODO(fase-3-exam-submit-learnex): activate real IDB query` comment. Satisfies `exam-list` D4 (dead-code seam) and `offline-storage` Scenario "Clave IDB retiene segmento simulacro".
- [ ] 4.8 Verify `npm run lint` passes.

---

## Commit 5 — `feat(LR): view-models + pages migration to Exam vocabulary`

Agent: `frontend-builder`

- [ ] 5.1 In `src/LR_render/view-models/home.view-model.ts`: inject `MarkingsStorage` and call `hasSubmittedAck(examId)` per exam; compose 5-branch card state (`pending` / `open` / `submitted` / `closed` + dead `submitted` branch for in_progress+ack). In Change 1 only 3 branches are live (`pending`, `open`, `closed`). Satisfies `exam-list` Scenarios "Tarjeta pending", "Tarjeta open", "Tarjeta closed".
- [ ] 5.2 In `src/LR_render/view-models/home.view-model.ts`: `primaryText()` closure display — `new Date(exam.scheduled.getTime() + exam.duration * 1000)` formatted as "HH:MM". `secondaryText()` — `exam.area ?? exam.course ?? '—'`. Satisfies `exam-list` Scenarios "Cálculo correcto del tiempo de cierre", "area null", "area y course null".
- [ ] 5.3 In `src/LR_render/view-models/home.view-model.ts`: add Signal branch for `StudentNotLinkedError` — dedicated `studentNotLinked` signal set to `true`; bind to UI copy "Tu cuenta no tiene un alumno asociado, contacta al tutor". Satisfies `exam-list` Scenario "UI muestra branch StudentNotLinked".
- [ ] 5.4 In `src/LR_render/view-models/home.view-model.ts`: on `ExamsPermissionRevokedError`, call existing logout flow + redirect to `/login`. Satisfies `exam-list` Requirement "403 cuando los permisos fueron revocados".
- [ ] 5.5 In `src/LR_render/view-models/simulacro.view-model.ts`: timer = `Math.max(0, exam.duration - (serverTime - exam.started!.getTime()) / 1000)` in seconds; `cierreHHMM` = `exam.scheduled.getTime() + exam.duration * 1000`; submit guard uses `exam.serverStatus.permiteEntrada()`. Satisfies `exam-list` Scenarios "Cálculo del timer", "Cálculo correcto del tiempo de cierre".
- [ ] 5.6 In `src/LR_render/view-models/simulacro.view-model.ts`: on `SubmissionNotAvailableError`, fall into generic unknown branch and navigate to `/home` (no custom UI copy). Satisfies `exam-submission` Scenario "View-model trata SubmissionNotAvailableError como error no recuperable".
- [ ] 5.7 In `src/LR_render/pages/home/home.page.ts` and `home.page.html`: update type/import references to `GetTodaysExamsUseCase`; preserve all Spanish UI strings verbatim; add template branch for `studentNotLinked` signal. Satisfies `exam-list` Scenario "UI muestra branch StudentNotLinked".
- [ ] 5.8 In `src/LR_render/pages/simulacro/simulacro.page.ts` and `simulacro.page.html`: update internal identifiers to use `Exam` vocabulary; preserve `/simulacro/:id` route URL (es-PE, rule 5 intact). Satisfies `exam-list` Requirement "Refresh".
- [ ] 5.9 In `src/LR_render/app.routes.ts`: update type-level references to `GetTodaysExamsUseCase`/`Exam` only where imported; route paths stay unchanged. No behavioral change.
- [ ] 5.10 Verify `npm run lint` passes.

---

## Commit 6 — `chore(infra): rename DI token SIMULACROS_API→EXAMS_API + app.config wiring`

Agent: general-purpose

- [ ] 6.1 In `src/L3_periphery/tokens.ts`: rename `SIMULACROS_API` InjectionToken constant to `EXAMS_API` with description `'ExamsApi'`. Satisfies D5.
- [ ] 6.2 In `src/app.config.ts`: update provider entry — `provide: EXAMS_API`, `useExisting: HttpExamsApi`; remove any reference to `SIMULACROS_API` or `HttpSimulacrosApi`. Satisfies D5.
- [ ] 6.3 Grep entire `src/` for remaining `SIMULACROS_API` or `HttpSimulacrosApi` or `SimulacrosApi` references; fix any found. Satisfies compile-time completeness.
- [ ] 6.4 Verify `npm run build` succeeds (full tree compiles). Satisfies D5 "Compila el árbol completo".
- [ ] 6.5 Verify `npm run lint` passes.

---

## Commit 7 — `test: reshape L1/L2/L3/LR specs to Exam vocabulary`

Agent: `test-engineer`

_Note: This commit may be split into 7a (L1/L2/L3) and 7b (LR) if it exceeds 8 files._

- [ ] 7.1 `git mv tests/unit/L1_domain/entities/simulacro.spec.ts tests/unit/L1_domain/entities/exam.spec.ts`; reshape all `new Simulacro(...)` calls to `new Exam(...)` with new constructor shape (drop `fin`, add `duration`, `course`, `type`, `started`, `finished`, `scheduled`). Satisfies `exam-list` Requirement "Entidad Exam" (tests).
- [ ] 7.2 `git mv tests/unit/L1_domain/value-objects/estado-simulacro.spec.ts tests/unit/L1_domain/value-objects/exam-server-status.spec.ts`; replace `EstadoSimulacro` with `ExamServerStatus`; replace Spanish state values with `'scheduled' | 'in_progress' | 'finalized'`. Satisfies `exam-list` Requirement "ExamServerStatus".
- [ ] 7.3 In `tests/unit/L1_domain/errors/errors.spec.ts`: add/update tests for `ExamsPermissionRevokedError`, `StudentNotLinkedError`, `SubmissionNotAvailableError`; include `expect(new SubmissionNotAvailableError() instanceof NetworkError).toBe(false)`. Satisfies `exam-submission` Scenario "SubmissionNotAvailableError no es instancia de NetworkError".
- [ ] 7.4 In `tests/unit/L1_domain/entities/marcacion.spec.ts`: rename `simulacroId → examId` in all constructor calls and assertions; assert `marcacion.examId` exists and `marcacion.simulacroId` does not. Satisfies `offline-storage` Scenario "Marcacion construida con examId".
- [ ] 7.5 `git mv tests/unit/L2_application/obtener-simulacros-del-dia.use-case.spec.ts tests/unit/L2_application/get-todays-exams.use-case.spec.ts`; rename class, fakes, and all `simulacroId → examId` inside. Satisfies `exam-list` Scenarios "Lista no vacía", "Lista vacía", "Error de red".
- [ ] 7.6 In `tests/unit/L2_application/fakes.ts`: rename fake `SimulacrosApi → ExamsApi`; add `hasSubmittedAck` stub returning `false`; rename `simulacroId → examId` in all fake `MarkingsStorage` methods. Satisfies test infrastructure.
- [ ] 7.7 In `tests/unit/L2_application/enviar-simulacro.use-case.spec.ts`: rename `simulacroId → examId`; add test case: when `ExamsApi.enviar` throws `SubmissionNotAvailableError`, `MarkingsStorage.enqueueEnvio` spy receives 0 calls. Satisfies `exam-submission` Scenario "EnviarSimulacroUseCase no encola SubmissionNotAvailableError".
- [ ] 7.8 In `tests/unit/L2_application/marcar-respuesta.use-case.spec.ts` and `programar-auto-envio.use-case.spec.ts` and `retomar-envios-pendientes.use-case.spec.ts`: rename `simulacroId → examId`; update timer math assertions in `programar-auto-envio` to use `duration * 1000` (seconds). Satisfies `exam-list` Requirement "factor ×1000".
- [ ] 7.9 `git mv tests/feature/L3_periphery/http/http-simulacros-api.spec.ts tests/feature/L3_periphery/http/http-exams-api.spec.ts`; rewrite adapter spec with 8 scenarios: 200 (3 server-status values, nulls en `area`/`course`/`started`), 403, 404+`STUDENT_NOT_LINKED`, 404 sin code, 500, 429, y caso de skip silencioso (lista mixta con un item `started: null + in_progress` → adapter devuelve solo los válidos, emite `console.warn` spy verificado, NO lanza error). Satisfies `exam-list` Scenarios "Lista no vacía", "403", "404+code", "404 sin code", "skip silencioso", error scenarios.
- [ ] 7.10 `git mv tests/feature/L3_periphery/http/http-simulacros-api-enviar.spec.ts tests/feature/L3_periphery/http/http-exams-api-enviar.spec.ts`; add test: `enviar()` throws `SubmissionNotAvailableError` synchronously and `HttpClient` spy receives 0 calls. Satisfies `exam-submission` Scenario "POST enviar lanza error sin llamada HTTP".
- [ ] 7.11 In `tests/feature/L3_periphery/storage/markings-storage.spec.ts`: rename `simulacroId → examId`; add test for `hasSubmittedAck` stub returning `false` in Change 1; add test verifying IDB key retains `"simulacro"` segment. Satisfies `offline-storage` Scenarios "Clave IDB retiene segmento simulacro", D4 stub.
- [ ] 7.12 In `tests/feature/L3_periphery/envio/envio-retry-dispatcher.spec.ts`: rename `simulacroId → examId` across all fixtures and assertions. Satisfies `offline-storage` Requirement "Rename".
- [ ] 7.13 In `tests/feature/LR_render/view-models/home.view-model.spec.ts`: add 5-branch card-state scenarios (3 reachable in Change 1: `pending`, `open`, `closed`; 2 dead branches stubbed as `yaEnvie=false`). Update all `Simulacro` → `Exam` constructor calls. Satisfies `exam-list` Scenarios "Tarjeta pending/open/closed", "Cálculo del timer", "area null", "UI muestra branch StudentNotLinked".
- [ ] 7.14 In `tests/feature/LR_render/view-models/simulacro.view-model.spec.ts`: update timer math assertions to `Math.max(0, exam.duration - elapsed/1000)`; rename all entity refs. Satisfies `exam-list` Scenario "Cálculo del timer para tarjeta open".
- [ ] 7.15 In `tests/feature/LR_render/pages/home/home.page.spec.ts` and `simulacro.page.spec.ts`: rename `Simulacro → Exam`, `simulacroId → examId`; add test for `studentNotLinked` branch rendering. Satisfies `exam-list` Scenario "UI muestra branch StudentNotLinked".
- [ ] 7.16 Run `npm test` — all tests green. Satisfies CI gate.

---

## Pre-merge Gates

- [ ] G1 **`hexagonal-guard` audit**: run `hexagonal-guard` sub-agent on `src/`; confirm no boundary violations (L2 touching Angular, L1 touching browser APIs, mapper antipatterns). Run after commit 5, before commit 6 merge.
- [ ] G2 **All unit + feature tests pass**: `npm test` exits 0 (green) on the full commit 7 tree.
- [ ] G3 **Lint clean**: `npm run lint` exits 0 on all 7 commits individually.
- [ ] G4 **Build clean**: `npm run build` exits 0 after commit 6 (full tree compiles).
- [ ] G5 **Manual smoke**: login as `79507732@vonex.edu.pe` → `/home` renders exam cards with correct server-status labels → IDB key inspection confirms `cartilla.<email>.simulacro.<examId>` pattern retained.
- [ ] G6 **No `"vonex"` literals in `src/`**: confirm rule 6 (tenant slug from `environment.tenantSlug` only).
- [ ] G7 **No `simulacroId` in TypeScript identifiers in `src/`**: grep confirms rename is complete (IDB string literals `"simulacro"` are acceptable; TypeScript identifiers are not).
