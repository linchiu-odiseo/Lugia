# Tasks — fase-3-exam-submit-learnex

## Preamble

This change ships as a **single PR with 6–7 sequential commits** (≤8 files each). Commits 1–4 compile in isolation and pass lint; commits 5–6 wire up the UI layer; commit 7 brings the test tree to green.

Sub-agent channels: commits 1, 2, 3, 4, 6 are mechanical TypeScript — implementable inline or by a general-purpose agent. **Commit 5 → delegate to `frontend-builder`**. **Commit 7 → delegate to `test-engineer`**. Post-commit-5, pre-merge **→ delegate to `hexagonal-guard`** for a read-only boundary audit.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–950 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Maybe |
| Suggested split | 6 commits in 1 PR; if CI blocks on size, split 7 into 7a (L1/L2/L3) / 7b (LR) |
| Delivery strategy | single-pr (all commits green together before merge) |

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | L1 (VO + reshape + new/dropped errors + port migration) | Commits 1 | Compiles isolated |
| 2 | L2 + L3 (use case + adapter POST + IDB ack) | Commits 2–4 | Depends on Unit 1 |
| 3 | LR (modal + view-models + cleanup) | Commits 5–6 | Depends on Unit 2 |
| 4 | Tests | Commit 7 | Green CI; hexagonal-guard gate |

---

## Commit 1 — `feat(L1): SubmissionAck VO + EnvioRequest/EnvioResult reshape + StudentNotEnrolledError + drop SubmissionNotAvailableError`

Agent: general-purpose

- [x] 1.1 Create `src/L1_domain/value-objects/submission-ack.ts` exporting `SubmissionAck` class with readonly `id: string`, `submissionHash: string`, `submittedAt: Date`. Constructor validates `id` non-empty, `submissionHash` exactly 64 hex chars (`/^[0-9a-f]{64}$/`), `submittedAt` is valid `Date`. Throws plain `Error` with descriptive message on invalid shape. Satisfies `exam-submission` Requirement "SubmissionAck VO en L1".
- [x] 1.2 In `src/L1_domain/ports/exams-api.ts`: rename `EnvioRequest.clientSubmittedAt → clientFinishedAt`; add `code: string` (DNI alumno). Reshape `EnvioResult` to `{ ack: SubmissionAck }` — remove `status`, `clientSubmittedAt`, `serverReceivedAt`. Update inline comment of mapping table. Satisfies `exam-submission` Requirement "ExamsApi.enviar contrato real".
- [x] 1.3 Create `src/L1_domain/errors/student-not-enrolled.error.ts`: `export class StudentNotEnrolledError extends Error { name = 'StudentNotEnrolledError'; }`. Satisfies `exam-submission` Scenario "Mapeo de 403 STUDENT_NOT_ENROLLED".
- [x] 1.4 Delete `src/L1_domain/errors/submission-not-available.error.ts`. Satisfies `exam-submission` Requirement "Cleanup de SubmissionNotAvailableError".
- [x] 1.5 In `src/L1_domain/ports/markings-storage.ts`: remove `hasSubmittedAck(examId): Promise<boolean>` from `MarkingsStorage` interface; add `getSubmissionAck(examId: string): Promise<SubmissionAck | null>` and `setSubmissionAck(examId: string, ack: SubmissionAck): Promise<void>`. Update doc comment of `wipeUserScope` to mention "borra también acks". Satisfies `offline-storage` Requirements "MarkingsStorage.setSubmissionAck/getSubmissionAck" and "Cleanup hasSubmittedAck".
- [x] 1.6 Verify `npm run lint` passes (L2/L3/LR errors will compile-break here — expected until later commits).

---

## Commit 2 — `feat(L2): EnviarSimulacroUseCase inyecta IdentityStorage + reshape keys + persiste ack`

Agent: general-purpose

- [x] 2.1 In `src/L2_application/use-cases/enviar-simulacro.use-case.ts`: add constructor param `private readonly identityStorage: IdentityStorage` as 4th port. Update DI registration in `app.config.ts` accordingly (this file may move to commit 6 if cleaner). Satisfies `exam-submission` Requirement "EnviarSimulacroUseCase inyecta IdentityStorage".
- [x] 2.2 In the same file: at start of `execute()`, read identity via `await this.identityStorage.get()`; if `null`, throw `SessionExpiredError`. Otherwise extract `code = identity.codigo` — if `codigo` is null (tutor stub), throw `SessionExpiredError` (defensive; should never happen under student role guard). Satisfies `exam-submission` Scenario "Sesión expirada durante envío".
- [x] 2.3 In the same file: rename internal var `clientSubmittedAt → clientFinishedAt`; pass through reshape helper `toResponses(answers: AnswersMap): Record<string, 'A'|'B'|'C'|'D'|'E'>` that filters out `null` values and prefixes keys with `"P"` (e.g., `"1"` → `"P1"`). Place helper as private static or local function. Satisfies `exam-submission` Requirement "Reshape de responses con prefijo P y filtro de null".
- [x] 2.4 In the same file: pass `{ examId, code, responses, clientFinishedAt }` to `this.api.enviar(...)`. On success, persist via `await this.storage.setSubmissionAck(input.examId, result.ack)`; then `clearMarcaciones`. Return `{ status: 'enviado', ack: result.ack }`. Satisfies `exam-submission` Scenario "Envío exitoso persiste ack y limpia marcaciones".
- [x] 2.5 In the same file: in the catch, `NetworkError` branch enqueues as before AND returns `{ status: 'queued', ack: null }`. Drop the `SubmissionNotAvailableError` guard from the catch (the class no longer exists). Satisfies `exam-submission` Scenario "NetworkError encola y devuelve queued sin ack".
- [x] 2.6 In `src/L2_application/use-cases/retomar-envios-pendientes.use-case.ts`: when `api.enviar` succeeds, persist the returned ack via `storage.setSubmissionAck(envio.examId, result.ack)` BEFORE `dequeueEnvio` + `clearMarcaciones`. Add note in head comment: "el ack persistido permite que `/home` muestre la card 'Enviado' tras reabrir la app". Satisfies `exam-submission` Requirement "Queue retry persiste ack".
- [x] 2.7 In `src/L2_application/use-cases/retomar-envios-pendientes.use-case.ts`: agregar parámetro de payload — la entry encolada debe incluir `code` para reconstruir el body en el retry. Update `EnvioPendiente` interface en `markings-storage.ts` (L1) y `IndexedDbMarkingsStorage` (L3 — covered in commit 4 if needed). Si `IndexedDbMarkingsStorage.enqueueEnvio` ya conserva el objeto completo del payload, este step es ajuste menor. Satisfies `exam-submission` Scenario "Queue replay preserva el code original".
- [x] 2.8 Verify `npm run lint` passes.

---

## Commit 3 — `feat(L3): HttpExamsApi.enviar POST real + apiPath.studentExamSubmit + clasificación de errores`

Agent: general-purpose

- [x] 3.1 In `src/L3_periphery/http/api-paths.ts`: add method `studentExamSubmit(sessionId: string): string` → `` `${base()}/student/exam-sessions/${encodeURIComponent(sessionId)}/submit` ``. Satisfies `http-client` Requirement "apiPath.studentExamSubmit".
- [x] 3.2 In `src/L3_periphery/http/http-exams-api.ts`: replace the stub `enviar(_req)` with real POST. Build URL via `apiPath.studentExamSubmit(req.examId)` (Exam.id IS the sessionId, confirmed by backend handoff). Body shape exactly per contract: `{ code: req.code, responses: req.responses, client_finished_at: req.clientFinishedAt }`. Use `firstValueFrom(this.http.post<SubmitResponseDto>(url, body))`. Do NOT set `withCredentials` here — the credentials.interceptor handles it. Satisfies `exam-submission` Requirement "POST real al contrato learnex".
- [x] 3.3 In the same file: define DTO `interface SubmitResponseDto { id: string; submission_hash: string; submitted_at: string }`. On 201 success, construct `SubmissionAck` with `new Date(dto.submitted_at)` (validate via the VO constructor) and return `{ ack }`. Satisfies `exam-submission` Scenario "201 mapea a SubmissionAck".
- [x] 3.4 In the same file: add `classifySubmitError(err: unknown): Error` private method with the following table:
  - `404` → `SimulacroNoAsignadoError`
  - `403` + `body.message === 'STUDENT_NOT_ENROLLED'` → `StudentNotEnrolledError`
  - `403` + `body.message === 'STUDENT_MISMATCH'` → `NetworkError` (generic, no class — per D6)
  - `403` other → `NetworkError`
  - `409` + `body.message === 'SESSION_NOT_ACTIVE'` → `SimulacroCerradoError`
  - `422` + `body.message ∈ {'CLOCK_SKEW_BEFORE_START', 'CLOCK_SKEW_TOO_FAR_FUTURE'}` → `InvalidSubmissionTimeError`
  - `400` → `InvalidPayloadError`
  - `0 | 429 | 5xx` → `NetworkError`
  - anything else → `NetworkError`
  Wrap the POST in try/catch and call this classifier. Satisfies `http-client` Requirement "Clasificación POST submit" and `exam-submission` Scenarios "Mapeo de 403/404/409/422/400".
- [x] 3.5 In the same file: add inline comment block at top of `classifySubmitError` documenting the exception to the "never read message" rule: lista enumerada cerrada (`STUDENT_NOT_ENROLLED`, `STUDENT_MISMATCH`, `SESSION_NOT_ACTIVE`, `CLOCK_SKEW_BEFORE_START`, `CLOCK_SKEW_TOO_FAR_FUTURE`); cualquier otro valor cae a `NetworkError`. Referenciar `design.md` D5. Satisfies maintainability requirement.
- [x] 3.6 Verify `npm run lint` passes.

---

## Commit 4 — `feat(L3): IndexedDbMarkingsStorage setSubmissionAck/getSubmissionAck + wipeUserScope extiende acks`

Agent: general-purpose

- [x] 4.1 In `src/L3_periphery/storage/indexed-db-markings-storage.ts`: add private method `ackKey(examId): string` → `` `cartilla.${userEmail}.ack.${examId}` `` (resolves email from `identityStorage` internally, same pattern as marcaciones). Satisfies `offline-storage` Requirement "Clave IDB de ack scopeada por userEmail".
- [x] 4.2 In the same file: implement `setSubmissionAck(examId, ack)` storing the serialized form `{ id, submissionHash, submittedAt: ack.submittedAt.toISOString() }` under the ack key. Implement `getSubmissionAck(examId)` returning `null` if no entry, or reconstructing `SubmissionAck` via the VO constructor from the stored payload. Satisfies `offline-storage` Scenarios "setSubmissionAck persiste ack" and "getSubmissionAck reconstruye SubmissionAck".
- [x] 4.3 In the same file: remove the legacy `hasSubmittedAck` implementation. Satisfies `offline-storage` Requirement "Cleanup hasSubmittedAck".
- [x] 4.4 In the same file: extend `wipeUserScope()` to also delete entries under `cartilla.<email>.ack.*`. Satisfies `offline-storage` Scenario "wipeUserScope borra acks del usuario".
- [x] 4.5 If `EnvioPendiente` interface in `markings-storage.ts` (L1) was extended to carry `code` (per task 2.7), ensure `IndexedDbMarkingsStorage.enqueueEnvio` and `getEnviosPendientes` round-trip the field. If `EnvioPendiente` already spreads the full payload, this is no-op. Satisfies `offline-storage` Requirement "Queue payload preserva code".
- [x] 4.6 Verify `npm run lint` passes.

---

## Commit 5 — `feat(LR): <app-submission-receipt-modal> + simulacro view-model integra modal + home view-model migra a getSubmissionAck`

Agent: `frontend-builder`

- [x] 5.1 Create `src/LR_render/components/submission-receipt-modal/submission-receipt-modal.component.ts` + `.html` + `.scss`. Standalone component with `@Input() ack!: SubmissionAck` (required) and `@Output() close = new EventEmitter<void>()`. Template uses backdrop with `backdrop-filter: blur(6px)` and modal card centered. Renders check icon, "Envío exitoso" title, "Pendiente de calificación" subtitle, server time as `"HH:MM — DD mmm YYYY"`, hash block 4×4×4 (4 lines of 4 groups of 4 hex chars), single "Volver al inicio" button bound to `(click)="close.emit()"`. Apply haptic pulse on init via existing `navigator.vibrate` pattern. Satisfies `exam-marking` Requirements "Modal de comprobante shape" and "Hash visible 4×4×4".
- [x] 5.2 In `src/LR_render/components/submission-receipt-modal/submission-receipt-modal.component.ts`: add helper `formatHashBlock(hash: string): string[]` returning 4 lines (each `XXXX XXXX XXXX XXXX`). Pure function; validate input is 64 hex chars (defensive log on mismatch, render as fallback). Satisfies `exam-marking` Requirement "Hash visible 4×4×4".
- [x] 5.3 In `src/LR_render/view-models/simulacro.view-model.ts`: add `readonly lastAck = signal<SubmissionAck | null>(null)`. Drop the `SubmissionNotAvailableError` import and the branch in `handleSubmissionError` that handled it. In `submit()` success path: when `result.status === 'enviado'` AND `result.ack !== null`, call `this.lastAck.set(result.ack)` and DO NOT navigate immediately — the modal will show. When user dismisses the modal (`onReceiptClose`), then navigate to `/home`. Satisfies `exam-marking` Requirements "Modal aparece tras 201" and "Cleanup SubmissionNotAvailableError".
- [x] 5.4 In the same file: add public method `onReceiptClose(): void` that calls `this.lastAck.set(null)` and `void this.router.navigate(['/home'])`. Satisfies `exam-marking` Scenario "Modal dismiss navega a home".
- [x] 5.5 In `src/LR_render/pages/simulacro/simulacro.page.html`: at the end, add conditional render of `<app-submission-receipt-modal>` when `vm.lastAck()` is non-null, binding `[ack]="vm.lastAck()!"` and `(close)="vm.onReceiptClose()"`. Also disable the "Enviar" button when `vm.lastAck() !== null` (UX defensive — modal is open). Satisfies `exam-marking` Scenarios "Modal aparece tras 201", "Botón Enviar deshabilitado tras 201".
- [x] 5.6 In `src/LR_render/view-models/home.view-model.ts`: replace the `ackByExamId: Map<string, boolean>` signal with `ackByExamId: Map<string, SubmissionAck | null>` (`null` when no ack for that examId). In `refreshAcks`, call `this.markings.getSubmissionAck(exam.id)` per exam (try/catch defaults to null). Update `buildCard` to pass `SubmissionAck | null` to `composeEstado` and the text helpers. Satisfies `exam-marking` Requirements "Card enviado con ack real" and "Hora del server".
- [x] 5.7 In the same file: `composeEstado` matrix updates — `in_progress + ack !== null` → `enviado`; `finalized + ack !== null` → `enviado`; remaining branches identical. `primaryText` for `enviado` returns `` `Enviado · ${formatHHMM(ack.submittedAt)}` `` (uses ack.submittedAt, not effectiveCloseAt). `secondaryText` for `enviado` returns `"Pendiente de calificación"` (replaces the `area ?? course ?? '—'` fallback for this state). Satisfies `exam-marking` Scenarios "Card enviado muestra HH:MM del server", "secondaryText pendiente de calificación".
- [x] 5.8 In `src/LR_render/pages/home/home.page.html`: no template change needed beyond what's already there — the card variant `card--enviado` exists. Verify the icon-and-text rendering reads correctly with new copy. If the secondaryText area needs an inline icon `hourglass_top` next to "Pendiente de calificación", add it (small Material symbol, 14px). Satisfies `exam-marking` Scenario "secondaryText con icono hourglass".
- [x] 5.9 Verify `npm run lint` passes.

---

## Commit 6 — `chore(LR): cleanup banner queued copy + drop SubmissionNotAvailableError refs`

Agent: general-purpose

- [x] 6.1 In `src/LR_render/pages/simulacro/simulacro.page.html`: update banner-queued copy to "Sin conexión. Tus respuestas se enviarán automáticamente cuando vuelva la red." Remove any "Reintentar ahora" button if present. Satisfies `exam-marking` Requirement "Copy banner queued".
- [x] 6.2 Run `grep -r "SubmissionNotAvailableError" src/` and confirm zero matches. If any residual import or comment exists in LR, remove it. Satisfies `exam-submission` Requirement "Cleanup completo".
- [x] 6.3 In `src/app.config.ts`: update the `EnviarSimulacroUseCase` factory to inject `IdentityStorage` as 4th argument (if not already done in commit 2). Satisfies DI wiring.
- [x] 6.4 Run `npm run build` and confirm full tree compiles. Satisfies build gate.
- [x] 6.5 Verify `npm run lint` passes.

---

## Commit 7 — `test: specs L1/L2/L3/LR del flujo POST + ack + modal`

Agent: `test-engineer`

_Note: This commit may be split into 7a (L1/L2/L3) and 7b (LR) if it exceeds 8 files._

- [x] 7.1 Create `tests/unit/L1_domain/value-objects/submission-ack.spec.ts`: constructor accepts valid `(id, 64-hex hash, valid Date)`; rejects empty id, non-hex hash, hash of wrong length, invalid Date. Satisfies `exam-submission` Requirement "SubmissionAck VO".
- [x] 7.2 In `tests/unit/L1_domain/errors/errors.spec.ts`: add test for `StudentNotEnrolledError` (instanceof, name); remove test for `SubmissionNotAvailableError`. Satisfies `exam-submission` Requirements "StudentNotEnrolledError" and "Cleanup".
- [x] 7.3 Update `tests/unit/L2_application/fakes.ts`: add `setSubmissionAck`/`getSubmissionAck` to fake `MarkingsStorage` (in-memory map); remove `hasSubmittedAck`. Ensure fake `IdentityStorage` is exportable and reusable. Satisfies test infra.
- [x] 7.4 In `tests/unit/L2_application/enviar-simulacro.use-case.spec.ts`: rewrite with 4th port injection. Add scenarios:
  - Success path: `api.enviar` returns `{ ack }`, use case calls `setSubmissionAck` then `clearMarcaciones`, returns `{ status: 'enviado', ack }`.
  - `responses` shape: input AnswersMap with mixed nulls produces output with only marked answers, keys prefixed with `P`.
  - Identity null → `SessionExpiredError` raised before `api.enviar` is called.
  - NetworkError → enqueued with full payload (including `code`), returns `{ status: 'queued', ack: null }`.
  - Other error (e.g. `SimulacroCerradoError`) propagates without touching storage.
  Satisfies `exam-submission` Scenarios "Envío exitoso persiste ack", "Reshape de keys filtra null", "Sesión expirada durante envío", "NetworkError encola".
- [x] 7.5 In `tests/unit/L2_application/retomar-envios-pendientes.use-case.spec.ts`: add scenario for successful retry persisting ack before dequeue. Satisfies `exam-submission` Scenario "Queue retry persiste ack".
- [x] 7.6 In `tests/feature/L3_periphery/http/http-exams-api.spec.ts` (or new dedicated `http-exams-api-submit.spec.ts`): scenarios:
  - 201 → returns `{ ack }` with parsed Date and validated hash.
  - 400 → `InvalidPayloadError`.
  - 403 + `body.message === 'STUDENT_NOT_ENROLLED'` → `StudentNotEnrolledError`.
  - 403 + `body.message === 'STUDENT_MISMATCH'` → `NetworkError`.
  - 403 + other message → `NetworkError`.
  - 404 → `SimulacroNoAsignadoError`.
  - 409 + `body.message === 'SESSION_NOT_ACTIVE'` → `SimulacroCerradoError`.
  - 422 + `body.message ∈ {'CLOCK_SKEW_BEFORE_START', 'CLOCK_SKEW_TOO_FAR_FUTURE'}` → `InvalidSubmissionTimeError`.
  - 429 → `NetworkError`.
  - 500 → `NetworkError`.
  - URL is `/t/{slug}/student/exam-sessions/{sessionId}/submit` with sessionId equal to `EnvioRequest.examId`.
  - Body shape matches contract exactly: `{ code, responses, client_finished_at }`.
  Satisfies `http-client` Requirement "Clasificación POST submit" and `exam-submission` Scenarios.
- [x] 7.7 In `tests/feature/L3_periphery/storage/markings-storage.spec.ts`: scenarios:
  - `setSubmissionAck` + `getSubmissionAck` round-trip preserves `id`, `submissionHash`, `submittedAt` (Date equality via getTime).
  - `getSubmissionAck` returns `null` for unknown examId.
  - IDB key follows `cartilla.<email>.ack.<examId>` pattern.
  - `wipeUserScope` deletes ack entries for current user; preserves other users' acks.
  Satisfies `offline-storage` Scenarios.
- [x] 7.8 In `tests/feature/LR_render/view-models/home.view-model.spec.ts`: update mock `getSubmissionAck` to return either `null` or a fake `SubmissionAck`. Update all `composeEstado` tests:
  - `in_progress + ack` → estado `enviado`, primaryText `"Enviado · HH:MM"` using ack.submittedAt.
  - `finalized + ack` → estado `enviado`, primaryText same.
  - `in_progress + null` → estado `abierto`.
  - `finalized + null` → estado `cerrado`.
  - `enviado` card secondaryText is `"Pendiente de calificación"`.
  Satisfies `exam-marking` Scenarios.
- [x] 7.9 In `tests/feature/LR_render/view-models/simulacro.view-model.spec.ts`: add scenarios for `lastAck`:
  - Successful submit sets `lastAck` and does NOT navigate.
  - `onReceiptClose` clears `lastAck` and navigates to `/home`.
  - Successful queue retry (status `queued`) does NOT set `lastAck`, does NOT show modal.
  - Drop the SubmissionNotAvailableError scenario.
  Satisfies `exam-marking` Scenarios.
- [x] 7.10 Create `tests/feature/LR_render/components/submission-receipt-modal.spec.ts`: scenarios:
  - Renders the hash in 4 lines of 4 groups of 4 hex chars each.
  - Renders `submittedAt` formatted as `"HH:MM — DD mmm YYYY"`.
  - Renders "Envío exitoso" title and "Pendiente de calificación" subtitle.
  - Emits `(close)` on button click.
  - Defensive: hash of incorrect length still renders something (fallback) without crashing.
  Satisfies `exam-marking` Requirements "Modal de comprobante shape" and "Hash visible 4×4×4".
- [x] 7.11 Run `npm test` — all green. Satisfies CI gate.

---

## Pre-merge Gates

- [x] G1 **`hexagonal-guard` audit**: run sub-agent on `src/`; confirm no boundary violations. Run after commit 6, before merge.
- [x] G2 **All unit + feature tests pass**: `npm test` exits 0.
- [x] G3 **Lint clean**: `npm run lint` exits 0 on all commits individually.
- [x] G4 **Build clean**: `npm run build` exits 0 after commit 6.
- [x] G5 **Manual smoke**:
  - Login as `30303011@vonex.edu.pe`.
  - Open one exam that backend has activated to `in_progress` (coordinate with back to get a sessionId).
  - Mark a few answers.
  - Tap "Enviar".
  - Verify: modal appears centered with hash in 4 lines, server time, "Pendiente de calificación".
  - Tap "Volver al inicio".
  - Verify: card on /home shows "Enviado · HH:MM" + "Pendiente de calificación".
  - Reload the app, navigate to /home. Card still shows "Enviado" (ack persists in IDB).
  - Tap "Enviar" again on a different exam with airplane mode on. Verify banner amarillo "Sin conexión..." appears, no "Reintentar ahora" button. Turn off airplane mode; verify (after a few seconds) the modal appears with the comprobante.
- [x] G6 **No `"vonex"` literals in `src/`**: confirm rule 6.
- [x] G7 **No `SubmissionNotAvailableError` in `src/`**: grep confirms cleanup.
- [x] G8 **No `clientSubmittedAt` in `src/`** (only `clientFinishedAt`): grep confirms rename.
