# Archive Report — restyle-native-excellence

**Date**: 2026-06-14  
**Project**: Lugia  
**Change**: restyle-native-excellence  
**Status**: ARCHIVED  

## Executive Summary

The change `restyle-native-excellence` has been successfully archived following completion of implementation, verification (PASS WITH NOTES), and delta spec merges. The change introduces the Native Excellence design system (CSS Variables tokens, light mode, updated typography, and updated exam-marking UX) while preserving all Phase 1 and Phase 2 behavior intact. Zero critical issues. Manual visual QA tasks (10.1-10.4) deferred by user.

## Change Scope

This change applied the approved Native Excellence design system to Lugia PWA:

### New Capabilities
- **`design-tokens`**: Complete CSS Variables system (`:root` in `src/styles.scss`) defining colors, spacing, radius, and fonts per W3C standard. No new npm dependencies.

### Modified Capabilities
- **`exam-marking`**: Replaced hint toast (one-shot notification) with permanent chip "Toca para cambiar" visible during `editing` state. Chip appears in top-right corner of row, persists until auto-lock at 5s or manual lock. UX improvement: ambient feedback replaces discoverable one-shot.

### Unchanged Capabilities
- `auth-*` (Phase 1)
- `http-client`, `route-protection`, `session-storage` (Phase 1)
- `exam-list`, `exam-submission`, `offline-storage`, `server-time-sync`, `connectivity-indicator` (Phase 2)

All 8 existing capabilities remain intact in terms of behavior and contract. The restyle is purely cosmetic (UI layer + styling tokens).

## Implementation Summary

**Code Changes**: 46/50 design tasks checked. Manual visual QA tasks 10.1-10.4 deferred by user but explicitly authorized for archiving.

**Key Artifacts Modified**:
- `src/styles.scss` — introduced `:root` with 40+ CSS Variables (colors, spacing, radius, fonts)
- `src/LR_render/app.scss` — refactored to consume tokens
- `src/LR_render/pages/login/login.page.scss/.html` — light mode restyle
- `src/LR_render/pages/home/home.page.scss/.html` — light mode + inspirational quote block + lugia.png
- `src/LR_render/pages/simulacro/simulacro.page.scss/.html` — light mode + chip instead of toast
- `src/LR_render/pages/home/inspirational-quotes.ts` — new utility with INSPIRATIONAL_QUOTES array
- `src/LR_render/components/connectivity-badge/connectivity-badge.component.scss` — light mode restyle
- `src/index.html` — updated theme-color, added Google Fonts link, adjusted iOS status bar
- `public/manifest.json` — updated background_color to light palette
- `public/img/lugia.png` — new asset (Lugia mascot)
- Test suite updates: removed hint-toast assertions, added chip assertions, added inspirational quotes tests

**Commits**: 14 commits (scaffold + C1..C10 + 3 follow-up fixes for status bar, manifest icons, theme-color)

## Verification Evidence

### Build & Test Metrics
| Metric | Result |
|--------|--------|
| Unit + Feature Tests | 399/399 passing, 36 test files |
| Lint Check | ✓ All files pass |
| Format Check | ✓ Pass (docs/agent-activity.md pre-existing warning excluded) |
| Build Time | 2.32s, 273 kB raw / 73.65 kB gzip |
| Lazy Chunks | login-page 46.78 kB, home-page 17.06 kB, simulacro-page 16.83 kB |

### Spec Compliance

**design-tokens (NEW)**:
- ✓ `:root` declares CSS Variables with correct naming convention (`--color-*`, `--space-*`, `--radius-*`, `--font-*`)
- ✓ DESIGN.md palette fully represented in `:root`
- ✓ grep hex in `src/LR_render/**` = zero matches (strict enforcement)
- ✓ All 5 SCSS files in LR_render consume `var(--color-*)`
- ✓ Spacing via `var(--space-*)` (no bare pixel scaling)
- ✓ Border-radius via `var(--radius-*)` (exception: 1 `border-radius:50%` for dot circle, self-documenting)
- ✓ Font-family via `var(--font-*)` (zero literals in LR_render)
- ✓ Google Fonts link with `display=swap` in `src/index.html`
- ✓ Zero new npm dependencies
- ✓ `angular.json` unchanged (only `serviceWorker` + budgets added, unrelated)

**exam-marking (MODIFIED)**:
- ✓ Tap simple on locked row: no change, no toast/hint
- ✓ Long-press 500ms on locked row: enters `editing`, shows `.row__chip` permanent (not one-shot)
- ✓ Chip visual: top-right, primary color, "Toca para cambiar" text, position absolute
- ✓ Movement >10px during long-press: cancels gesture, row remains locked
- ✓ Auto-lock after 5s: chip hides, border reset, row returns to locked
- ✓ One row editing at a time: verified in view-model and page tests
- ✓ Hint toast: completely removed, zero references remaining

**Hexagonal Boundary Check**:
- ✓ L1_domain: zero changes
- ✓ L2_application: zero changes
- ✓ L3_periphery: zero changes
- ✓ Change is 100% LR_render + root styling

### Issues Noted

**CRITICAL**: None.

**WARNING** (all explicitly accepted by user):
- W1: `rgb()` with alpha for tonal layers (legitimate exception for alpha-channel effects; commented inline)
- W2: `docs/agent-activity.md` Prettier pre-existing warning (not part of this change)
- W3: theme-color and iOS status-bar deviations from tasks.md 7.1/7.2 (user-approved follow-up fixes with commit rationale)

**SUGGESTION**:
- S1: Manual visual QA deferred (tasks 10.1-10.4) — user approved, recommend smoke test on physical device before production release to students
- S2: `border-radius:50%` for badge dot circle acceptable exception

## Delta Spec Merge Details

### 1. design-tokens (NEW Spec)

**Location**: `openspec/specs/design-tokens/spec.md`  
**Action**: Created (new spec, not a delta)  
**Content**: Complete specification defining CSS Variables tokens system, naming conventions, strict no-hex-literals rule for LR_render, token consumption across spacing/radius/font, Google Fonts loading, and zero-new-deps guarantee.  
**Requirements Merged**: 5 ADDED requirements covering all aspects of the design token system.

### 2. exam-marking (MODIFIED Spec)

**Location**: `openspec/specs/exam-marking/spec.md` (existing from Phase 2)  
**Action**: Merged delta (modified requirement, removed requirement)  
**Changes Applied**:

#### Scenario Updated: "Tap simple en burbuja de fila bloqueada no cambia la marca"
- OLD: "si es la primera vez en la sesión que el alumno intenta cambiar una fila bloqueada, la UI muestra un toast... intentos posteriores NO re-muestran el toast"
- NEW: "la UI NO muestra ningún toast, banner ni hint inline — el feedback de "no se cambió nada" es la propia ausencia de cambio visual"
- Rationale: Toast replaced by permanent chip in `editing` state

#### Scenario Updated: "Long-press en fila bloqueada entra a modo edición"
- OLD: "resalta el borde con color de acento... muestra hint "Toca para cambiar" debajo de las bubbles"
- NEW: "resalta el borde con `var(--color-primary)` y aplica tonal layer... muestra chip flotante "Toca para cambiar" en esquina superior derecha, posicionado absolute sobre el borde, permanece visible durante toda la duración del estado `editing` (no es one-shot por sesión)"
- Rationale: Updated visual implementation (chip vs inline hint) and made permanence explicit

#### Scenario Updated: "Auto-bloqueo después de 5s sin acción"
- OLD: "resalte visual de edición desaparece"
- NEW: "resalte visual desaparece... chip "Toca para cambiar" deja de mostrarse"
- Rationale: Clarify chip behavior on auto-lock

#### Scenario Updated: "Solo una fila puede estar en edición a la vez"
- OLD: "fila 5 vuelve a `locked`... fila 7 pasa a `editing`"
- NEW: "fila 5 vuelve a `locked` y su chip se oculta... fila 7 pasa a `editing` y muestra su propio chip"
- Rationale: Explicit chip lifecycle on row transitions

#### Requirements REMOVED: "Hint toast one-shot"
- Requirement deleted: "Hint toast 'Mantén presionada la fila para cambiar tu respuesta' una vez por sesión"
- Migration notes: `showHintToast` signal, `hintShownInSession` flag, and `HINT_TOAST_VISIBLE_MS` all removed from code
- Replacement behavior: permanent chip during `editing` state (covered by updated scenarios)

## Source of Truth Updated

The following main specs have been synchronized with the delta:

- `openspec/specs/design-tokens/spec.md` — **NEW** (created from delta, 5 ADDED requirements)
- `openspec/specs/exam-marking/spec.md` — **MODIFIED** (3 scenarios updated + 1 requirement removed + chip behavior clarified)

**Unmodified Main Specs** (explicitly marked "no delta" in proposal):
- `openspec/specs/auth-session/spec.md` (Phase 1)
- `openspec/specs/auth-ui/spec.md` (Phase 1)
- `openspec/specs/http-client/spec.md` (Phase 1)
- `openspec/specs/route-protection/spec.md` (Phase 1)
- `openspec/specs/session-storage/spec.md` (Phase 1)
- `openspec/specs/exam-list/spec.md` (Phase 2)
- `openspec/specs/exam-submission/spec.md` (Phase 2)
- `openspec/specs/offline-storage/spec.md` (Phase 2)
- `openspec/specs/server-time-sync/spec.md` (Phase 2)
- `openspec/specs/connectivity-indicator/spec.md` (Phase 2)

These specs retain their Phase 1/Phase 2 definitions. The restyle is implementation detail of `design-tokens` and visual-only updates to exam-marking UX, not spec-level behavior changes to other capabilities.

## Archive Location

**Date**: 2026-06-14 (ISO format)  
**Archived Folder**: `openspec/changes/archive/2026-06-14-restyle-native-excellence/`  
**Contains**:
- `.openspec.yaml` — metadata
- `proposal.md` — full scope, rationale, capabilities
- `design.md` — design decisions, goals, non-goals, token system D1–D7
- `tasks.md` — all 10 task sections with completion checklist
- `verify-report.md` — verification evidence (build, tests, spec compliance)
- `specs/design-tokens/spec.md` — new capability spec
- `specs/exam-marking/spec.md` — delta spec for exam-marking modification

## Next Steps

**Immediate**:
- Commit archive move + spec merges to `master` with message: `chore(sdd): archivar restyle-native-excellence — Native Excellence design system live, exam-marking UX improved`
- Push to remote

**Follow-up** (user deferred):
- Manual visual QA tasks 10.1-10.4 (smoke test on iOS/Android device, verify light mode rendering, cita rotation, chip appearance, auto-lock timing)
- Optional: dark mode toggle (tokens already support it, toggleable via CSS Variables override)

**Phase 3** (pending definition):
- Results post-submission
- History of simulacros
- Multi-device sync improvements
- Anti-fraud hardening

## Traceability Notes

All artifacts from the change have been preserved in the archive folder for audit trail purposes:
- Proposal defines why and what
- Design explains decisions and non-goals
- Specs list requirements (2 NEW, 1 MODIFIED, 8 UNCHANGED)
- Tasks track implementation steps (46/50 code complete, 4/4 manual deferred)
- Verify-report documents all evidence (399 tests, zero critical issues, 3 warnings accepted)

The source of truth (`openspec/specs/`) now reflects the merged state: design-tokens added, exam-marking updated, all others unchanged.

---

**SDD Cycle Complete**: restyle-native-excellence has been fully planned (proposal), designed (design.md), specified (2 new/modified specs), implemented (46/50 tasks), verified (399 tests, PASS WITH NOTES), and archived. Ready for Phase 3.
