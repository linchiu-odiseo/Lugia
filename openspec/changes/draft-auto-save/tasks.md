# Tasks — draft-auto-save

## Preamble

This change ships as a **single PR with 6–7 sequential commits** (≤8 files each). Commits 1–4 compile in isolation and pass lint; commit 5 wires the dispatcher; commit 6 integrates the LR layer; commit 7 brings tests to green. The flag `DRAFT_ENABLED` defaults to `false`, so the PR can merge before the backend deploys the endpoint without runtime impact.

Sub-agent channels: commits 1–4 and 6 are mechanical TypeScript — implementable inline or by a general-purpose agent. **Commit 5 (dispatcher with timers)** stays in-line for code, but **its test file in commit 7 → delegate to `test-engineer`** (fake timers are tricky). **Commit 6 (view-model integration) → delegate to `frontend-builder`**. Post-commit-6, pre-merge **→ delegate to `hexagonal-guard`** for a read-only boundary audit.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350–500 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR with 6–7 commits; if CI blocks on size, split commit 7 into 7a (L2 unit + L3 HTTP feature) / 7b (L3 dispatcher feature + LR view-model feature) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | L1 port + L2 use case + L3 HTTP adapter | Commits 1–3 | Compiles isolated; no runtime activation |
| 2 | L3 dispatcher + env flag wiring | Commits 4–5 | Stub no-op covers `DRAFT_ENABLED=false`; runtime inert |
| 3 | LR view-model integration | Commit 6 | Depends on Unit 2 |
| 4 | Tests across all layers | Commit 7 | Green CI + hexagonal-guard gate |

---

## Commit 1 — `feat(L1): DraftRequest + ExamsApi.guardarDraft + mapeo de errores en comentarios`

Agent: general-purpose

- [ ] 1.1 In `src/L1_domain/ports/exams-api.ts`: add interface `DraftRequest { examId: string; code: string; responses: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'> }`. Comment block above clarifies "snapshot completo del set de respuestas; NO incluye clientFinishedAt (exclusivo del /submit)". Satisfies `submit-progress-snapshot` Requirement "ExamsApi.guardarDraft en L1".
- [ ] 1.2 In the same file: add method `guardarDraft(req: DraftRequest): Promise<void>` to the `ExamsApi` interface. Satisfies `submit-progress-snapshot` Requirement "ExamsApi.guardarDraft en L1".
- [ ] 1.3 In the same file: extend the port-level comment block with the error mapping table for the new endpoint `POST /student/exam-sessions/{id}/draft`, following the pattern of the submit block. Enumerate `DRAFT_ERROR_MESSAGES` set inline. Satisfies maintainability requirement.
- [ ] 1.4 Verify `npm run lint` passes. L3 adapter will compile-break until commit 3 — expected and acceptable for this commit boundary.

---

## Commit 2 — `feat(L2): GuardarDraftUseCase puro`

Agent: general-purpose

- [ ] 2.1 Create `src/L2_application/use-cases/guardar-draft.use-case.ts`. Class `GuardarDraftUseCase` with constructor injecting `ExamsApi`, `MarkingsStorage`, `IdentityStorage` (3 ports). Export class. Satisfies `submit-progress-snapshot` Requirement "GuardarDraftUseCase puro en L2".
- [ ] 2.2 In the same file: implement `execute({ examId }: { examId: string }): Promise<void>`. Order: `await identityStorage.get()` → if null or `identity.codigo === null`, throw `SessionExpiredError` (do NOT touch storage or api). Otherwise `await markingsStorage.getMarcaciones(examId)` → reshape via private `toResponses(answers)` helper (filter null values, prefix keys with `"P"`) → `await examsApi.guardarDraft({ examId, code: identity.codigo, responses })`. Propagate all port errors as-is. Satisfies `submit-progress-snapshot` Scenarios "Reshape AnswersMap" + "Sesión expirada antes del POST" + "Errores del port se propagan tal cual".
- [ ] 2.3 In the same file: add doc comment at the top: "Use case puro para auto-save. NO toca queue, NO persiste ack, NO borra marcaciones. Errores se propagan; el `DraftAutoSaveDispatcher` los clasifica para decidir cuál escala al view-model." Satisfies maintainability + the explicit "NO encolar / NO ack / NO clear" requirement.
- [ ] 2.4 Verify `npm run lint` passes.

---

## Commit 3 — `feat(L3): apiPath.studentExamDraft + HttpExamsApi.guardarDraft + DRAFT_ERROR_MESSAGES + timeout 10s`

Agent: general-purpose

- [ ] 3.1 In `src/L3_periphery/http/api-paths.ts`: add method `studentExamDraft(sessionId: string): string` → `` `${base()}/student/exam-sessions/${encodeURIComponent(sessionId)}/draft` ``. Pattern identical to `studentExamSubmit`. Satisfies `submit-progress-snapshot` Scenario "URL armada con apiPath.studentExamDraft".
- [ ] 3.2 In `src/L3_periphery/http/http-exams-api.ts`: implement `guardarDraft(req: DraftRequest): Promise<void>`. Build URL via `apiPath.studentExamDraft(req.examId)`. Body shape: `{ code: req.code, responses: req.responses }` — NO `client_finished_at`. Use `firstValueFrom(this.http.post<void>(url, body).pipe(timeout(10_000)))`. Do NOT set `withCredentials` here — the credentials.interceptor handles it. Satisfies `submit-progress-snapshot` Requirement "Contrato HTTP del endpoint /draft".
- [ ] 3.3 In the same file: add private constant `DRAFT_ERROR_MESSAGES = new Set<string>(['STUDENT_NOT_ENROLLED', 'STUDENT_MISMATCH', 'SESSION_NOT_FOUND', 'STUDENT_BY_CODE_NOT_FOUND', 'SESSION_NOT_ACTIVE'])`. Add private method `classifyDraftError(err: unknown): Error` implementing the table from the spec (400 → `InvalidPayloadError`; 403/404/409/422/429/5xx/0 mapped per table). Read `body.message` ONLY with `===` against the set members. Satisfies `submit-progress-snapshot` Requirement "Clasificación de errores POST draft".
- [ ] 3.4 In the same file: wrap the `firstValueFrom(...)` in try/catch and route through `classifyDraftError`. Add a top-of-method comment block in `classifyDraftError` documenting the excepción to the "never read message" rule, enumerating the 5 values, and referencing `design.md` D5/D10 (same justification as `SUBMIT_ERROR_MESSAGES`). Satisfies `submit-progress-snapshot` Scenario "Set DRAFT_ERROR_MESSAGES está documentado inline".
- [ ] 3.5 In the same file: verify the classifier never uses `.includes()`, `.match()`, or regex on `message`. Satisfies `submit-progress-snapshot` Scenario "Clasificador NO usa regex ni includes() sobre message".
- [ ] 3.6 Verify `npm run lint` passes.

---

## Commit 4 — `chore(env): build-env DRAFT_ENABLED + .env.example + environment.draftEnabled`

Agent: general-purpose

- [ ] 4.1 In `scripts/build-env.mjs`: read `DRAFT_ENABLED` from `process.env`; coerce to boolean (`'true' === lower` → `true`, else `false`). Emit `draftEnabled: <boolean>` in the generated environment files (`environment.ts`, `environment.development.ts`, `environment.production.ts`). Default `false` if the var is missing. Satisfies `submit-progress-snapshot` Scenario "Default ausente equivale a false".
- [ ] 4.2 In `.env.example`: document the new variable with a comment: `# DRAFT_ENABLED=false  # Habilita el auto-save de drafts (POST /student/exam-sessions/{id}/draft). Default: false hasta que el back deploye el endpoint.` Satisfies developer onboarding.
- [ ] 4.3 Run `npm run build-env` and verify the generated files include `draftEnabled: false` by default. Satisfies build gate.
- [ ] 4.4 Verify `npm run lint` passes.

---

## Commit 5 — `feat(L3): DraftAutoSaveDispatcher con debounce/throttle/coalesce/heartbeat + NoopDraftAutoSaveDispatcher + provider en app.config`

Agent: general-purpose (timer-heavy; tests delegados a `test-engineer` en commit 7)

- [ ] 5.1 Create `src/L3_periphery/envio/draft-auto-save-dispatcher.service.ts`. Define interface `IDraftAutoSaveDispatcher { notificarCambio(sessionId: string): void; cancelarDraftsPendientes(sessionId: string): void; readonly closedSessions: Signal<readonly string[]> }`. Satisfies `submit-progress-snapshot` Requirement "Cancel-on-submit" + "409 SESSION_NOT_ACTIVE escala al view-model".
- [ ] 5.2 In the same file: implement class `DraftAutoSaveDispatcher implements IDraftAutoSaveDispatcher`. Inject `GuardarDraftUseCase`. Internal state: `private readonly state = new Map<string, DraftState>()` where `DraftState = { dirty: boolean; debounceTimer: ReturnType<typeof setTimeout> | null; lastPostAt: number; inflight: boolean; stopped: boolean; retryCount: number; nextRetryAt: number | null }`. Constructor arms `setInterval(60_000)` for the heartbeat; the interval iterates the map and calls `fire(sessionId)` ONLY when `state.dirty && !state.inflight && !state.stopped && (state.nextRetryAt === null || Date.now() >= state.nextRetryAt)`. Satisfies `submit-progress-snapshot` Requirements "Heartbeat 60s dirty-only" + "Dispatcher arranca lazy" + "Backoff exponencial on retryable failures".
- [ ] 5.3 In the same file: implement `notificarCambio(sessionId)`: lazily create state entry if missing; set `dirty = true`; if `stopped`, return; cancel any existing `debounceTimer`; arm new `setTimeout(3000)` that calls `tryFire(sessionId)`. Satisfies `submit-progress-snapshot` Requirement "Dispatcher con debounce 3s".
- [ ] 5.4 In the same file: implement private `tryFire(sessionId)`: compute `now = Date.now()`. **First** gate: if `state.nextRetryAt !== null && now < state.nextRetryAt`, schedule `setTimeout(state.nextRetryAt - now)` que re-llama `tryFire` y retorna (backoff). **Después** gate: if `(now - state.lastPostAt) < 10_000`, schedule `setTimeout(10_000 - (now - lastPostAt))` que re-llama `tryFire` (throttle). Otherwise call `fire(sessionId)`. Satisfies `submit-progress-snapshot` Requirements "Throttle 10s entre POSTs" + "Backoff exponencial on retryable failures".

- [ ] 5.4b In the same file: define top-level constant `const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 120_000, 240_000, 300_000] as const`. Add private helper `private backoffDelay(retryCount: number): number { return retryCount > 0 ? BACKOFF_SCHEDULE_MS[Math.min(retryCount - 1, BACKOFF_SCHEDULE_MS.length - 1)] : 0; }`. Add inline comment referencing `design.md` D11 with the rationale (reset on success + cap 5min + cubre deploy-pendiente y caídas transitorias bajo la misma rama). Satisfies `submit-progress-snapshot` Requirement "Backoff exponencial on retryable failures".
- [ ] 5.5 In the same file: implement private async `fire(sessionId)`: if `inflight || !dirty || stopped`, return; set `inflight = true`, set `dirty = false`; `try` → `await useCase.execute({ examId: sessionId })`; on success set `lastPostAt = Date.now()`, **reset backoff**: `state.retryCount = 0`, `state.nextRetryAt = null`. `catch (e)`: classify by `instanceof`:
  - `SimulacroCerradoError` → set `stopped = true`, append sessionId to `closedSessions` signal. NO toca backoff state.
  - `NetworkError` → silent (dirty stays as-is); **incrementar backoff**: `state.retryCount += 1`, `state.nextRetryAt = Date.now() + this.backoffDelay(state.retryCount)`. NO marca stopped.
  - Other domain errors (`InvalidPayloadError`, `StudentNotEnrolledError`, `SimulacroNoAsignadoError`, `StudentNotLinkedError`, `SessionExpiredError`) → `stopped = true`, silent. NO toca backoff state.
  
  `finally` → `inflight = false`. Satisfies `submit-progress-snapshot` Requirements "Coalesce" + "Garantías no-fatal" + "409 escala al view-model" + "Backoff exponencial on retryable failures".
- [ ] 5.6 In the same file: implement `cancelarDraftsPendientes(sessionId)`: if entry exists, `clearTimeout(debounceTimer); debounceTimer = null; stopped = true`. Do NOT touch `inflight`. Add inline comment referencing `design.md` R2/R4 (race aceptable + inflight no abortable). Satisfies `submit-progress-snapshot` Requirement "Cancel-on-submit" + Scenario "cancelarDraftsPendientes NO aborta inflight".
- [ ] 5.7 In the same file: export `class NoopDraftAutoSaveDispatcher implements IDraftAutoSaveDispatcher`. All methods are empty bodies. `closedSessions` is a `signal<readonly string[]>([]).asReadonly()`. Satisfies `submit-progress-snapshot` Requirement "Feature flag DRAFT_ENABLED — dispatcher inerte cuando apagado".
- [ ] 5.8 In the same file: add head comment block referencing `design.md` D1, D2, D8 — explain semantic difference vs `EnvioRetryDispatcher` (exactly-once durable vs best-effort efímero), lazy arrival from view-model (no APP_INITIALIZER), and per-sessionId state map. Satisfies maintainability + `submit-progress-snapshot` Requirement "Dispatcher arranca lazy".
- [ ] 5.9 In `src/app.config.ts`: add factory provider for `DraftAutoSaveDispatcher`. If `environment.draftEnabled === true`, return `new DraftAutoSaveDispatcher(useCase)`. Else return `new NoopDraftAutoSaveDispatcher()`. Also add the factory for `GuardarDraftUseCase` (injecting `EXAMS_API`, `MARKINGS_STORAGE`, `IDENTITY_STORAGE`). Satisfies `submit-progress-snapshot` Requirement "Feature flag DRAFT_ENABLED".
- [ ] 5.10 Verify `npm run lint` passes.

---

## Commit 6 — `feat(LR): simulacro.view-model engancha notificarCambio + cancelarDraftsPendientes + draftStatus signal`

Agent: `frontend-builder`

- [ ] 6.1 In `src/LR_render/view-models/simulacro.view-model.ts`: inject `DraftAutoSaveDispatcher` (the provider returns the real one or the noop depending on `environment.draftEnabled`). Add private field. Satisfies wiring.
- [ ] 6.2 In the same file: in `marcarRespuesta()` (after the IDB write completes successfully), invoke `this.draftDispatcher.notificarCambio(this.sessionId)`. Satisfies `submit-progress-snapshot` Scenario "Una marca dispara 1 POST tras 3s" (integration side).
- [ ] 6.3 In the same file: in every branch of `submit()` (before any rama: success guard, queued path, error path), invoke `this.draftDispatcher.cancelarDraftsPendientes(this.sessionId)` as the first statement. Satisfies `submit-progress-snapshot` Requirement "Cancel-on-submit".
- [ ] 6.4 In the same file: in `stop()` (lifecycle hook al salir de la página o destroy del view-model), invoke `this.draftDispatcher.cancelarDraftsPendientes(this.sessionId)` to prevent timer leak. Satisfies `design.md` R1 mitigation.
- [ ] 6.5 In the same file: register an `effect()` that observes `draftDispatcher.closedSessions` and, when it contains the current `sessionId`, dispara el branch `errorState = 'cerrado'` + redirect a `/home` reusando el flujo existente. Satisfies `submit-progress-snapshot` Requirement "409 SESSION_NOT_ACTIVE escala al view-model".
- [ ] 6.6 In the same file: add `readonly draftStatus = signal<'idle' | 'syncing' | 'synced' | 'offline'>('idle')`. NO update logic is required en este change (la signal queda inicializada como 'idle' por design — UI visible diferida). Document with inline comment: "Signal opcional para UI futura. Hoy queda en 'idle' — el dispatcher no expone ganchos para actualizarla. Change posterior los agregará cuando UX pida render visible." Satisfies maintainability + the explicit "signal opcional sin render" del proposal.
- [ ] 6.7 Verify `npm run lint` passes.

---

## Commit 7 — `test: specs L2 + L3 adapter + L3 dispatcher + LR view-model con timers fake`

Agent: `test-engineer`

_Note: This commit may be split into 7a (L2 unit + L3 HTTP feature) y 7b (L3 dispatcher feature + LR view-model feature) if it exceeds 8 files._

- [ ] 7.1 Create `tests/unit/L2_application/guardar-draft.use-case.spec.ts`. Scenarios:
  - Reshape: AnswersMap `{1:'A', 2:null, 5:'D'}` → adapter recibe `{P1:'A', P5:'D'}`.
  - Identity null → `SessionExpiredError` raised antes de tocar storage o api.
  - `identity.codigo === null` → `SessionExpiredError`.
  - AnswersMap vacío → `responses: {}`.
  - `examsApi.guardarDraft` rechaza con `SimulacroCerradoError` → propaga tal cual.
  - Use case NO invoca `enqueueEnvio` ni `setSubmissionAck` ni `clearMarcaciones` (asserts contra fake spy).
  Satisfies `submit-progress-snapshot` Scenarios "Reshape AnswersMap" + "Sesión expirada" + "Use case NO toca queue ni ack" + "Errores del port se propagan tal cual".
- [ ] 7.2 In or alongside `tests/feature/L3_periphery/http/http-exams-api.spec.ts`: add scenarios for `guardarDraft`:
  - URL es `/t/{slug}/student/exam-sessions/{id}/draft`.
  - Body exact: `{ code, responses }` sin `client_finished_at`.
  - 204 → resuelve `undefined`.
  - 400 → `InvalidPayloadError`.
  - 403 + `STUDENT_NOT_ENROLLED` → `StudentNotEnrolledError`.
  - 403 + `STUDENT_MISMATCH` → `NetworkError`.
  - 403 + other → `NetworkError`.
  - 404 + `SESSION_NOT_FOUND` → `SimulacroNoAsignadoError`.
  - 404 + `STUDENT_BY_CODE_NOT_FOUND` → `StudentNotLinkedError`.
  - 404 sin message conocido → `NetworkError`.
  - 409 + `SESSION_NOT_ACTIVE` → `SimulacroCerradoError`.
  - 429 → `NetworkError`. 500 → `NetworkError`. Timeout → `NetworkError`.
  - Adapter NO setea `withCredentials` manual (delegado al interceptor).
  Satisfies `submit-progress-snapshot` Requirement "Clasificación de errores POST draft" (todos los scenarios).
- [ ] 7.3 Create `tests/feature/L3_periphery/envio/draft-auto-save-dispatcher.spec.ts`. Use `vi.useFakeTimers()`. Scenarios:
  - 1 `notificarCambio` + 3000ms → 1 POST.
  - 10 `notificarCambio` en 2s + 3000ms → 1 POST (coalesce).
  - `notificarCambio` a t=0 y a t=2000ms → POST a t=5000ms (debounce reset).
  - Throttle: tras éxito, segundo `notificarCambio` 3s después → POST a t = (lastPostAt + 10s), no antes.
  - Throttle NO se aplica si el POST previo falló (lastPostAt sigue en 0).
  - Heartbeat 60s con `dirty=true && !inflight && !stopped` → POST. Heartbeat sin `dirty` → no-op. Heartbeat con `stopped` → no-op.
  - Coalesce: `notificarCambio` durante POST en vuelo deja `dirty=true` para el próximo ciclo.
  - `cancelarDraftsPendientes` cancela debounce y setea `stopped=true`; futuros `notificarCambio` no programan timer.
  - `cancelarDraftsPendientes` NO aborta inflight (el POST en vuelo se completa).
  - 409 `SimulacroCerradoError` → `stopped=true` y la signal `closedSessions` emite el sessionId.
  - `NetworkError` → silencio, dirty queda, no escala signal.
  - `InvalidPayloadError` → `stopped=true`, silencio, signal NO escala (no es 409).
  - **Backoff 1° falla**: `NetworkError` → `state.retryCount === 1`, `nextRetryAt = now + 30_000`. Heartbeat a t=60_000ms NO dispara si nextRetryAt no se cumplió (en este caso ya pasó, sí dispara; usar `lastPostAt=0` para forzar el test).
  - **Backoff 2° falla**: tras 2 fallas consecutivas, delay aplicado === 60_000ms.
  - **Backoff 3° falla**: delay === 120_000ms.
  - **Backoff 4° falla**: delay === 240_000ms.
  - **Backoff 5° falla y subsiguientes**: delay === 300_000ms (techo). 6° y 10° falla también === 300_000ms.
  - **Reset on success**: con `retryCount=4`, un POST exitoso (HTTP 204) → `retryCount === 0`, `nextRetryAt === null`. La siguiente falla aplica 30_000ms (no 300_000ms).
  - **Heartbeat respeta backoff**: con `dirty=true` y `nextRetryAt = now + 120_000`, un tick del heartbeat 60_000ms después NO dispara POST. Un tick más tarde (total 120_000ms) SÍ permite el dispatch.
  - **Backoff NO aplica a errores duros**: `InvalidPayloadError` o `SimulacroCerradoError` → `retryCount` NO se incrementa, `nextRetryAt` permanece `null`.
  - **404 sin message → NetworkError → backoff**: simular fallo con `NetworkError` para verificar que el dispatcher trata el caso deploy-pendiente con el mismo backoff que cualquier otro `NetworkError` (autoheal si el back deploya mid-sesión).
  Satisfies `submit-progress-snapshot` Requirements "Debounce 3s" + "Throttle 10s" + "Heartbeat 60s" + "Coalesce" + "Cancel-on-submit" + "409 escala" + "Garantías no-fatal" + "Backoff exponencial on retryable failures".
- [ ] 7.4 In `tests/feature/L3_periphery/envio/draft-auto-save-dispatcher.spec.ts` (continuación): scenario para `NoopDraftAutoSaveDispatcher`:
  - `notificarCambio` no programa timer.
  - `cancelarDraftsPendientes` no-op.
  - `closedSessions` siempre vacía.
  Satisfies `submit-progress-snapshot` Scenario "Flag apagado → view-model invoca stub sin error".
- [ ] 7.5 In `tests/feature/LR_render/view-models/simulacro.view-model.spec.ts`: add scenarios:
  - Tras `marcarRespuesta` exitoso → `dispatcher.notificarCambio(sessionId)` invocado exactamente 1 vez.
  - `submit()` en todas sus ramas → `dispatcher.cancelarDraftsPendientes(sessionId)` invocado como primera operación.
  - `stop()` → `dispatcher.cancelarDraftsPendientes` invocado (no timer leak; el view-model se mockea con fake dispatcher que reporta invocaciones).
  - `dispatcher.closedSessions` emite sessionId actual → view-model setea `errorState = 'cerrado'` y dispara redirect a `/home`.
  - Con dispatcher = `NoopDraftAutoSaveDispatcher`, todos los métodos del view-model siguen funcionando idéntico (smoke); ningún POST se emite.
  Satisfies `submit-progress-snapshot` integration scenarios + `design.md` R1 mitigation.
- [ ] 7.6 Update `tests/unit/L2_application/fakes.ts` if needed: ensure fake `MarkingsStorage` y `IdentityStorage` cubren `getMarcaciones` por examId y `get()` retornando `Identity | null`. Satisfies test infra.
- [ ] 7.7 Update `scripts/build-env.mjs` tests (if any exist) or smoke-verify generated `environment.ts` includes `draftEnabled: false` by default. Satisfies build gate.
- [ ] 7.8 Run `npm test` — all green. Satisfies CI gate.

---

## Pre-merge Gates

- [ ] G1 **`hexagonal-guard` audit**: run sub-agent on `src/`; confirm no boundary violations. Specifically verify: `DraftAutoSaveDispatcher` NO importa nada de L1 salvo el use case (clase de L2) y los tipos de error (clases de L1). Run after commit 6, before merge.
- [ ] G2 **All unit + feature tests pass**: `npm test` exits 0.
- [ ] G3 **Lint clean**: `npm run lint` exits 0 on all commits individually.
- [ ] G4 **Build clean**: `npm run build` exits 0 after commit 6 with `DRAFT_ENABLED=false`.
- [ ] G5 **No `"vonex"` literals in `src/`**: confirm rule 6 of CLAUDE.md.
- [ ] G6 **Manual smoke con flag apagado**: `DRAFT_ENABLED=false`, login, abrir simulacro, marcar 10 respuestas, verificar en Network tab que NO se emite ningún POST a `/draft`. Tap "Enviar" — el submit final funciona idéntico a hoy.
- [ ] G7 **Manual smoke con flag prendido** (requiere endpoint deployado por back): `DRAFT_ENABLED=true`, login, abrir simulacro, marcar 1 respuesta, esperar 3s, verificar 1 POST 204 al endpoint con body `{ code, responses }`. Marcar 10 más rápido — verificar coalesce. Tap "Enviar" — verificar que el draft pendiente se cancela y el submit funciona. Provocar 409 (back cierra la sesión) — verificar que el view-model muestra el flujo "cerrado" + redirect a `/home`.
- [ ] G8 **Verificar comentarios inline**: el classifier de `HttpExamsApi.guardarDraft` documenta inline el set `DRAFT_ERROR_MESSAGES` y referencia `design.md` D5/D10. El dispatcher documenta inline su diferencia con `EnvioRetryDispatcher` (D1/D8). Satisfies maintainability.
- [ ] G9 **Rate limit check**: en G7, contar POSTs durante 5 minutos de marcas constantes. Máximo esperado: ~30 (1 cada 10s); con heartbeat agregado, hasta ~5 extras. Total ≤35/5min = 7/min ≪ 30/min del back. Satisfies `proposal.md` Dependencies.
- [ ] G10 **Backoff smoke con back caído**: con `DRAFT_ENABLED=true` y el back forzado a 503 (o el contenedor docker apagado), abrir simulacro, marcar respuestas constantemente durante 10 minutos. Verificar en Network: primer fallo seguido de espera 30s, segundo 60s, tercero 2min, cuarto 4min, quinto+ 5min (techo). Encender el back y marcar una vez más: el próximo intento debe salir OK (204) y el contador resetear (la siguiente falla volvería a esperar 30s). El alumno NO ve ningún error visible durante todo el experimento. Satisfies `submit-progress-snapshot` Requirement "Backoff exponencial on retryable failures".

---

## Amendment — Fixed-length string format (post-handoff con learnex)

Tras coordinación con learnex (antes de que el back implementara `/draft`), el contrato del body cambió: `responses` ahora es un **string compacto de longitud `exam.count`** en vez de `Record<"P<n>", Letter>`. Ahorra ~9× en peso de body y RAM de Redis. Ver `design.md` D12. Estas tasks documentan el refactor encima de los commits 1–7 ya mergeados.

### Commit A — `refactor: /draft responses como string fija de exam.count chars (L1+L2+L3+LR)`

Agent: general-purpose (frontend-builder para el view-model)

- [ ] A.1 `src/L1_domain/ports/exams-api.ts`: cambiar `DraftRequest.responses` de `Record<string, 'A'|...|'E'>` a `string`. Actualizar comentario del bloque para documentar el formato del string (longitud `exam.count`, `'-'` para null, ver design.md D12). Satisfies `submit-progress-snapshot` Requirement "ExamsApi.guardarDraft en L1".
- [ ] A.2 `src/L2_application/use-cases/guardar-draft.use-case.ts`: cambiar signature a `execute({ examId, count }: { examId: string; count: number })`. Reemplazar `toResponses(answers)` con `toResponsesString(answers, count)`: crea `new Array<string>(count).fill('-')`, recorre `answers`, escribe `arr[parseInt(p)-1] = letra` si no es null y está en rango. Retorna `arr.join('')`. Satisfies `submit-progress-snapshot` Requirement "GuardarDraftUseCase puro en L2".
- [ ] A.3 `src/L3_periphery/http/http-exams-api.ts`: el body del POST ya pasa `req.responses` como está; el cambio es solo tipo (de `Record` a `string`). Verificar que el HTTP body serializado sea `{ code, responses: "<string>" }`. Satisfies `submit-progress-snapshot` Requirement "Contrato HTTP del endpoint /draft".
- [ ] A.4 `src/L3_periphery/envio/draft-auto-save-dispatcher.service.ts`: agregar `count: number` a `DraftState`. Cambiar signature de `notificarCambio(sessionId, count: number)` en la interfaz `IDraftAutoSaveDispatcher`. Persistir `count` en el state al lazy-create y actualizar idempotente en llamadas subsiguientes. En `fire`, pasar `count: state.count` al `useCase.execute`. Actualizar `NoopDraftAutoSaveDispatcher` con la nueva signature (sigue siendo no-op). Satisfies `submit-progress-snapshot` Requirement "Dispatcher con debounce 3s" + Scenario "count se persiste en DraftState".
- [ ] A.5 `src/LR_render/view-models/simulacro.view-model.ts`: en la llamada `draftDispatcher.notificarCambio(sessionId)` pasar `exam.count` (o el accessor equivalente). Verificar que `exam` esté disponible donde se invoca. Satisfies integración con `submit-progress-snapshot` Requirement "Dispatcher con debounce 3s".
- [ ] A.6 Verificar `npm run lint` y `npm run build` pasan limpios.

### Commit B — `test: actualizar fixtures de draft a string compacto + count`

Agent: `test-engineer`

- [ ] B.1 `tests/unit/L2_application/guardar-draft.use-case.spec.ts`: actualizar todos los scenarios para pasar `count` y assert `responses` como string. Cubrir: `{P1:E,P2:A,P3:null,P4:C}` con count=4 → `"EA-C"`; AnswersMap vacío con count=5 → `"-----"`; marcas dispersas con count=6 → `"A---D-"`; count=0 → `""`; marca fuera de rango con count=4 → se ignora.
- [ ] B.2 `tests/feature/L3_periphery/http/http-exams-api-draft.spec.ts`: actualizar body assert al string compacto. El scenario "Body exact match" debe verificar `responses: "A-C-"` (string).
- [ ] B.3 `tests/feature/L3_periphery/envio/draft-auto-save-dispatcher.spec.ts`: actualizar todas las llamadas a `notificarCambio("S1")` a `notificarCambio("S1", count)` (ej. count=4 para fixture chico). Verificar que el use case fake recibe `{ examId, count }`. Agregar un scenario nuevo: "count se persiste en state y se pasa al fire".
- [ ] B.4 `tests/feature/LR_render/view-models/simulacro.view-model.spec.ts` (y `simulacro.page.spec.ts` si toca): actualizar el spy de `notificarCambio` para asertar la signature `(sessionId, count)` con el count del fixture de Exam.
- [ ] B.5 Verificar `npm test` pasa limpio (698 → mismo número o ligeramente superior con los scenarios nuevos del use case).
