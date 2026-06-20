# Archive Report — tutor-exam-management

**Archived:** 2026-06-20  
**Status:** Archived and closed  
**Change Name:** `tutor-exam-management`  
**Archive Folder:** `openspec/changes/archive/2026-06-20-tutor-exam-management/`  
**Branch:** `feat/tutor-exams-management`

## Summary

The `tutor-exam-management` change has been successfully archived after completion of implementation and verification phases. The change introduces the full tutor side of the virtual-exam flow in the Lugia PWA: L1 port + read-models + 4 domain errors + 6 L2 use-cases + L3 HTTP adapter with status-based error classification + 2 view-models (list + management) + 2 pages + `TutorExamsStore` root singleton, routing updates, and a complete profile/classrooms header.

**All 912 tests pass green (0 critical issues, final verify PASS).** Implementation includes 19 commits across 3 PRs plus 2 UX-fix commits. The change is ready to be merged to `testing` (main branch) once the backend learnex PR #276 (`feat/virtual-exam-ui`) is available in `develop`.

## What Shipped

### PR1 — `feat: tutor-exams foundation (L1+L2+L3) no UI`
Branch: `feat/tutor-exams-foundation` → `testing`
- Commits 1–9: domain errors, port `TutorExamsApi`, read-models (`TutorExam`, `TutorExamDetail`, `ClassroomStudent`, `FinalizeResult`), 6 L2 use-cases, 6 `apiPath` helpers with `encodeURIComponent`, `HttpTutorExamsApi` adapter + `classifyTutorError`, `TUTOR_EXAMS_API` token + `app.config.ts` wiring, `FakeTutorExamsApi`.
- Runtime-inert after PR1: no page injects the use-cases yet.

### PR2 — `feat: tutor exam list screen (/tutor/home)`
Branch: `feat/tutor-exam-list` → `testing` (stacked on PR1)
- Commits 10–15: `TutorExamsStore` (root singleton), `TutorExamsListViewModel` (120s polling + tab-visibility pause + store publish), `TutorExamsListPage` (3-state cards, profile header, classrooms section, logout), route update `/tutor/home` → `TutorExamsListPage`.

### PR3 — `feat: tutor exam management screen (/tutor/exams/:recordId)`
Branch: `feat/tutor-exam-management` → `testing` (stacked on PR2)
- Commits 16–19: `TutorExamDetailViewModel` (D1 store-resolve + refetch fallback, iniciar/finalizar/toggleStudent, copy-by-action error table, store.upsert after actions), `TutorExamDetailPage` (iOS-safe back button, status-conditional action buttons, read-only in finalized mode, actionError banner), new route `/tutor/exams/:recordId`.

### UX-fix commits (post-PR3, on branch `feat/tutor-exams-management`)
- 2 additional commits fixing UX edge-cases surfaced during integration smoke testing (store.upsert after successful iniciar/finalizar + back button always present in error state).

## Final Verification State

| Gate | Status | Evidence |
|------|--------|---------|
| Tests | PASS | 912 tests green, 0 critical issues |
| Lint | PASS | `npm run lint` clean across all commits |
| No "vonex" literals | PASS | `rg '"vonex"' src/` returns empty |
| Hexagonal boundaries | PASS | Port (L1) zero Angular imports; use-cases no `HttpClient`/`Injectable`; adapter no L2 imports |
| Finalize 200 assertion | PASS | Adapter spec asserts HTTP 200 + `{ transitioned, jobId? }` body (not 202/204) |
| Deep-link store-miss | PASS | VM refetches list on cold navigation; `classroomId` resolved correctly |
| actionError copy by-type | PASS | `instanceof` checks only — zero `body.message` comparisons |
| Student domain untouched | PASS | No `MarkingsStorage`/`enqueueEnvio`/`IndexedDB` in tutor VM files |
| Integration smoke | PASS | Requires learnex PR #276 locally; human-verified for all 3 PRs |

## Capabilities Synced to Main Specs

### New Capabilities Promoted

| Spec File | Action | Requirements | Scenarios |
|-----------|--------|--------------|-----------|
| `openspec/specs/tutor-exams-api/spec.md` | **Created** | 8 requirements | ~40 scenarios covering port, read-models, 6 HTTP contracts, classifyTutorError, 6 use-cases, DI wiring |
| `openspec/specs/tutor-exam-list/spec.md` | **Created** | 5 requirements | ~25 scenarios covering VM polling, store, 3-state cards, navigation, profile header, local provider |
| `openspec/specs/tutor-exam-management/spec.md` | **Created** | 7 requirements | ~30 scenarios covering classroomId resolution, all signals, iniciar/finalizar/habilitar guards, copy-by-action table, network error/retry, back button |

### Modified Capabilities Merged

| Spec File | Action | Delta Summary |
|-----------|--------|---------------|
| `openspec/specs/http-client/spec.md` | **Merged** | Added 2 requirements: 6 `apiPath` tutor helpers + `classifyTutorError` table with independence scenario |
| `openspec/specs/route-protection/spec.md` | **Merged** | Added 3 requirements: `/tutor/home` → `TutorExamsListPage`, new `/tutor/exams/:recordId`, student routes untouched guarantee |

## Artifacts Moved to Archive

```
openspec/changes/tutor-exam-management/
├── proposal.md                                     → archive/2026-06-20-tutor-exam-management/proposal.md
├── design.md                                       → archive/2026-06-20-tutor-exam-management/design.md
├── tasks.md (all 19 commits + 2 UX-fixes marked)  → archive/2026-06-20-tutor-exam-management/tasks.md
├── archive-report.md                               → archive/2026-06-20-tutor-exam-management/archive-report.md
└── specs/
    ├── tutor-exams-api/spec.md
    ├── tutor-exam-list/spec.md
    ├── tutor-exam-management/spec.md
    ├── http-client/spec.md
    └── route-protection/spec.md
```

All files present. No artifacts lost.

## Key Design Decisions Captured

1. **D1 — classroomId resolution via TutorExamsStore**: root-singleton store avoids extra GET on warm navigation; cold deep-link refetches list once. No backend change needed.
2. **D2 — classify by HTTP status (L3), copy by action (VM)**: backend tutor emits generic codes + variable prose. VM knows action context → disambiguates two 409s and two 422s without parsing `body.message`.
3. **D3 — online-only, no outbox**: tutor actions are server state transitions, not durable user content. NetworkError → visible retry state, nothing queued.
4. **D4 — `/tutor/home` IS the list**: collapses double-redirect from roleGuard; mirrors `/student/home` pattern.
5. **D5 — defense-in-depth UI guards + backend 422/409**: button disabled in UI prevents common case; backend error handles concurrent/stale cases.
6. **finalize returns 200 not 202**: controller comment says 202 but implementation returns 200 with `{ transitioned, jobId? }`. Locked by adapter test. See learnex PR #276.

## Backend Dependency Note

The 6 endpoints consumed by this change are in learnex branch `feat/virtual-exam-ui` / PR #276, **not yet in `develop`**. Integration requires that branch running locally. Coordination with the learnex team is required before the Lugia branch can be smoke-tested against production-equivalent data.

## Deployment Notes

1. **No IDB migration**: no new IndexedDB stores; rollback is a clean `git revert` of merge commits.
2. **Strictly additive**: does not touch student domain, `credentials.interceptor`, `EnvioRetryDispatcher`, `MarkingsStorage`, `OutboxStoragePort`, or student routes. Reverting PR2/PR3 leaves PR1 inert (nobody injects use-cases).
3. **Rollback**: `git revert` the 3 merge commits + 2 UX-fix commits. No migration. No env flag needed.

## Spec Base Structure After Archive

```
openspec/specs/
├── auth-session/
├── auth-profile/
├── auth-ui/
├── connectivity-indicator/
├── design-tokens/
├── exam-list/
├── exam-marking/
├── exam-submission/
├── http-client/               (MODIFIED — 2 new Requirements added)
├── offline-storage/
├── pwa-shell-update/
├── route-protection/          (MODIFIED — 3 new Requirements added)
├── server-time-sync/
├── session-storage/
├── submit-progress-snapshot/
├── tutor-exams-api/           (NEW — created from delta)
├── tutor-exam-list/           (NEW — created from delta)
└── tutor-exam-management/     (NEW — created from delta)
```

## SDD Cycle Completion

Phase 1 — Propose: Change scoped, 3-PR delivery plan, online-only stance, classroomId resolution strategy, 6-endpoint contract verified against learnex PR #276.
Phase 2 — Spec: 5 delta specs (3 new + 2 modified); all capabilities defined with Requirements and Scenarios.
Phase 3 — Design: 8 decisions (D1–D8) with rationales, file-structure map (D6), DI wiring template (D7), testing approach (D8).
Phase 4 — Tasks: 19 implementation commits across 3 PRs + review workload forecast + 10 work units.
Phase 5 — Apply: 19 commits (3 PRs) + 2 UX-fix commits merged; 912 tests green.
Phase 6 — Verify: 0 critical issues; final PASS.
Phase 7 — Archive: 3 new live specs created, 2 existing live specs merged; tasks marked complete; change folder moved to archive.

**The change is fully closed. Branch `feat/tutor-exams-management` is ready for PR to `testing`.**

## Next Steps

1. Coordinate with learnex team on PR #276 (`feat/virtual-exam-ui`) promotion to `develop`.
2. Once learnex endpoints are in `develop`, run integration smoke (tasks.md G7-PR3) against a shared environment.
3. Merge `feat/tutor-exams-management` → `testing` via PR.

---

**Archive Completed By:** sdd-archive executor  
**Timestamp:** 2026-06-20  
**OpenSpec Workflow Version:** 2.0 (hybrid mode: filesystem + engram persistence)
