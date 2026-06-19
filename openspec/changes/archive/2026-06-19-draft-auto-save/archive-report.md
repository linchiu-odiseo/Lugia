# Archive Report — draft-auto-save

**Archived:** 2026-06-19  
**Status:** Archived and closed  
**Change Name:** `draft-auto-save`  
**Archive Folder:** `openspec/changes/archive/2026-06-19-draft-auto-save/`

## Summary

The `draft-auto-save` change has been successfully archived after completion of implementation and verification phases. The change introduces auto-save of exam progress (draft snapshots) to a new learnex endpoint `POST /t/{slug}/student/exam-sessions/{sessionId}/draft`, with debounce/throttle/coalesce/heartbeat orchestration, feature flag control, and non-fatal error handling.

**All 705 tests pass green (0 critical issues).** Implementation includes 9 commits (7 apply + 2 amend). The feature is disabled by default (`DRAFT_ENABLED=false`) and ready to merge before backend deployment.

## Capability Synced to Main Specs

### New Capability Promoted

**`submit-progress-snapshot`** (from `openspec/changes/draft-auto-save/specs/submit-progress-snapshot/spec.md`)

- **Type:** New capability (no existing delta to merge)
- **Location:** Promoted to `openspec/specs/submit-progress-snapshot/spec.md`
- **Requirements:** 16 major requirements covering HTTP contract, L1 port, L2 use case, L3 adapter error classification, dispatcher with debounce/throttle/coalesce/heartbeat/backoff, cancel-on-submit, 409 escalation, non-fatal guarantees, race handling, feature flag, lazy initialization.
- **Scenarios:** 82 scenario-based acceptance criteria across all layers.

### Modified Capabilities

- **`http-client`** (delta in proposal.md Section "Impact"): MINOR update documenting `apiPath.studentExamDraft` helper and `DRAFT_ERROR_MESSAGES` classification table for POST draft. Extends existing exception to "never read message" rule with same pattern as `SUBMIT_ERROR_MESSAGES`.
- **`exam-submission`** (delta in proposal.md Section "Impact"): MINOR clarification that dispatcher cancels pending drafts before all submit branches and that submit endpoint unchanged in this change.

**Note:** Both modified capabilities remain in their existing locations (`openspec/specs/http-client/spec.md`, `openspec/specs/exam-submission/spec.md`). Specific delta amendments are documented in the proposal and design for future PR application if needed.

## Artifacts Moved to Archive

```
openspec/changes/draft-auto-save/
├── proposal.md                              → archive/2026-06-19-draft-auto-save/proposal.md
├── design.md                                → archive/2026-06-19-draft-auto-save/design.md
├── specs/submit-progress-snapshot/spec.md  → archive/2026-06-19-draft-auto-save/specs/submit-progress-snapshot/spec.md
└── tasks.md                                 → archive/2026-06-19-draft-auto-save/tasks.md
```

All files present. No artifacts lost.

## Main Specs Updated

| Spec File | Action | Summary |
|-----------|--------|---------|
| `openspec/specs/submit-progress-snapshot/spec.md` | Created (new) | Full capability spec promoted from delta. 56 KB markdown, 16 requirements, 82 scenarios. Defines contract, dispatcher behavior, error classification, feature flag control. |

## Verification Status

| Gate | Status | Evidence |
|------|--------|----------|
| Tests | PASS | 705 tests green, 0 critical issues |
| Lint | PASS | `npm run lint` clean across all commits |
| Build | PASS | `npm run build` clean with `DRAFT_ENABLED=false` |
| Hexagonal boundaries | PASS | Dispatcher imports only L2 use case and L1 error types; no L1 domain logic leakage |
| No "vonex" literals | PASS | CLAUDE.md rule 6 compliant |
| Feature flag default | PASS | `DRAFT_ENABLED=false` (default), zero runtime impact when disabled |

## Key Design Decisions Captured

1. **D1:** `DraftAutoSaveDispatcher` separado de `EnvioRetryDispatcher` — opposite semantics (best-effort efímero vs exactly-once durable).
2. **D2:** Per-sessionId state map — handles multi-tab without state leakage between sessions.
3. **D3:** Debounce 3s + throttle 10s + heartbeat 60s + coalesce — comprehensive flow control with loss-free invariant.
4. **D11:** Backoff exponential 30s/1m/2m/4m/5m (techo) on `NetworkError` — auto-heal for deploy-pending and transient outages.
5. **D12:** `responses` as fixed-length string (not dict) — 9× RAM savings in Redis for high-concurrency scenarios.

All decisions documented in `design.md` and cross-referenced in spec requirements.

## Risk Mitigation Status

| Risk | Mitigation | Status |
|------|-----------|--------|
| Timer leak on view-model exit | Test mandatory in commit 7 (`stop()` → no POST after 60s) | Implemented; test coverage added |
| Draft-in-flight vs submit race | Back no-op silent on `final` key collision; acceptable | Documented in D2, R2; backend confirmed |
| 404 ambiguous during deploy | Silent backoff with autoheal + feature flag primary defense | Documented in D6, R3 |
| Dispatcher complexity vs retry-dispatcher | Clear semantic separation + inline documentation | D1 comment block + test suite |
| Inflight POST not abortable | Race aceptable (back no-op) + `stopped=true` prevents new fires | Documented in D8, R4, R5 |
| Line budget 400 overshoot | Single PR with 7 commits ≤8 files each; size-exception strategy | Forecast 350–500 lines; split plan available |

## Deployment Notes

1. **Feature Flag Disabled by Default:** `DRAFT_ENABLED=false`. No runtime impact on existing code paths (submit, marking, IDB). Stub dispatcher (`NoopDraftAutoSaveDispatcher`) is injected when flag is off.
2. **Backend Dependency:** Requires learnex deployment of `POST /t/{slug}/student/exam-sessions/{sessionId}/draft` endpoint. Timeline: coordinate with backend team.
3. **Rollback:** Feature-flag off disables all traffic. Revert PR is safe (no changes to `EnviarSimulacroUseCase`, `MarkingsStorage`, `/home` view-models).
4. **No IDB Migration:** Draft does not persist locally; only upstream. No schema version bump needed.

## Spec Base Structure After Archive

```
openspec/specs/
├── auth-session/
├── exam-list/
├── exam-marking/
├── exam-submission/
├── http-client/
├── offline-storage/
├── pwa-shell-update/
├── route-protection/
├── server-time-sync/
├── session-storage/
├── connectivity-indicator/
├── auth-profile/
├── auth-ui/
├── design-tokens/
└── submit-progress-snapshot/          (NEW — created from delta)
```

## SDD Cycle Completion

✅ **Phase 1 — Propose:** Change scoped, capabilities defined, risks documented.  
✅ **Phase 2 — Spec:** 16 requirements captured across 4 layers; 82 scenarios defined.  
✅ **Phase 3 — Design:** 12 decision gates (D1–D12) with rationales and trade-offs.  
✅ **Phase 4 — Tasks:** 7 commits mapped to sub-agents; review workload forecast provided.  
✅ **Phase 5 — Apply:** 9 commits (7 apply + 2 amend) merged; 705 tests green.  
✅ **Phase 6 — Verify:** 0 critical issues; all success criteria met.  
✅ **Phase 7 — Archive:** Artifacts moved; specs synced; report persisted.

**The change is fully closed and ready for the next change in the SDD cycle.**

## Next Steps

1. Coordinate with learnex on backend `/draft` endpoint deployment.
2. When backend confirms readiness, set `DRAFT_ENABLED=true` in `.env` and rebuild.
3. Smoke tests with feature flag enabled (scenarios G7, G10 from tasks.md pre-merge gates).
4. Deploy to production.

---

**Archive Completed By:** sdd-archive executor  
**Timestamp:** 2026-06-19  
**OpenSpec Workflow Version:** 2.0 (hybrid mode: filesystem + engram persistence)
