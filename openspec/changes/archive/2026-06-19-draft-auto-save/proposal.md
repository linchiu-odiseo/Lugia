# draft-auto-save — Proposal

- **Status:** proposed
- **Depends on:** `fase-3-exam-submit-learnex` (archived 2026-06-17)
- **Unlocks:** Force-close de tutor con piso de recuperación (alumnos no pierden marcaciones si el aula se cierra en seco), telemetría futura de progreso por sesión.

## Why

Hoy, todo el progreso del alumno mientras marca la cartilla vive **solo en IndexedDB local**. Si el dispositivo se rompe, el browser limpia el storage, o el tutor cierra el aula con force-close antes de que el alumno toque "Enviar", **las marcaciones se pierden silenciosamente**. El submit final es el único punto donde el server ve respuestas, y eso es muy tarde para escenarios de cierre forzado.

learnex confirmó el contrato de un nuevo endpoint `POST /t/{slug}/student/exam-sessions/{sessionId}/draft` que recibe snapshots completos del set de respuestas y los persiste en Redis (buffer hot). El draft NO reemplaza al submit — el submit sigue siendo el momento canónico (201 con hash de comprobante, idempotencia server-side). El draft es **piso de recuperación**: si el tutor hace force-close mientras el alumno no envió, el back tiene el último snapshot y puede emitir un envío administrativo en nombre del alumno.

Este change agrega el auto-save progresivo de forma **no-fatal** para la sesión: fallas del `/draft` nunca interrumpen al alumno; solo el cierre real del simulacro (`409 SESSION_NOT_ACTIVE`) escala UI reusando el flujo "cerrado" existente. El draft se manda con debounce 3s + throttle 10s + heartbeat 60s dirty-only para minimizar tráfico bajo carga (40 alumnos en aula).

## What changes

**L1 dominio**
- Nuevo tipo `DraftRequest` en el port `ExamsApi`: `{ examId, code, responses }`. NO incluye `clientFinishedAt` (exclusivo del submit final).
- Nuevo método `ExamsApi.guardarDraft(req: DraftRequest): Promise<void>` (response `204 No Content`, sin DTO).
- Actualizar el bloque de comentarios del port con el mapeo de errores del nuevo endpoint.
- Reusos: `InvalidPayloadError` (400), `StudentNotEnrolledError` (403 `STUDENT_NOT_ENROLLED`), `SimulacroNoAsignadoError` (404 `SESSION_NOT_FOUND`), `StudentNotLinkedError` (404 `STUDENT_BY_CODE_NOT_FOUND`), `SimulacroCerradoError` (409 `SESSION_NOT_ACTIVE`), `NetworkError` (0/429/5xx/timeout y todo lo que no esté en el enum cerrado).
- **Sin** nueva clase de error: el caso "endpoint aún no deployado" (404 sin `body.message` conocido) se traduce a un silent stop en L3 — no escala al dominio.

**L2 use cases**
- Nuevo `GuardarDraftUseCase` puro: recibe `{ examId }`, lee identity vía `IdentityStorage`, lee marcaciones vía `MarkingsStorage`, reshape `AnswersMap` → `responses` con prefijo `P` y filtro de nulls (idéntico al de `EnviarSimulacroUseCase`), delega al port `ExamsApi.guardarDraft`. NO toca queue. NO persiste ack. Errores se propagan tal cual; el dispatcher los clasifica.

**L3 adapter / dispatcher**
- `apiPath.studentExamDraft(sessionId)` → `/t/{slug}/student/exam-sessions/{sessionId}/draft`.
- `HttpExamsApi.guardarDraft`: POST con body `{ code, responses }` (snake_case, sin `client_finished_at`); `timeout(10_000)` envuelto antes de `firstValueFrom`; clasificador `classifyDraftError` con set cerrado `DRAFT_ERROR_MESSAGES = { 'STUDENT_NOT_ENROLLED', 'STUDENT_MISMATCH', 'SESSION_NOT_FOUND', 'STUDENT_BY_CODE_NOT_FOUND', 'SESSION_NOT_ACTIVE' }`. Patrón análogo al `SUBMIT_ERROR_MESSAGES` existente; misma excepción documentada a "nunca leer message".
- Nuevo servicio `DraftAutoSaveDispatcher` (NO en APP_INITIALIZER; arranca por sessionId desde el view-model). Estado por sessionId: `{ dirty, debounceTimer, lastPostAt, inflight, stopped }`. Métodos `notificarCambio(sessionId)`, `cancelarDraftsPendientes(sessionId)`. Debounce 3s desde el último cambio; throttle máx 1 POST cada 10s; coalescing con snapshot final; heartbeat 60s solo si `dirty && !inflight && !stopped`. Cancel-on-submit limpia debounce y setea `stopped=true` — NO aborta inflight (race aceptable porque el back hace no-op silent si `final` ya existe).

**LR render**
- `simulacro.view-model.ts`:
  - Inyecta `DraftAutoSaveDispatcher` solo si `environment.draftEnabled === true` (factory en `app.config.ts` devuelve no-op stub cuando está apagado).
  - Tras `marcarRespuesta` exitoso (post-IDB), llama `dispatcher.notificarCambio(sessionId)`.
  - Antes de cualquier rama de `submit()`, llama `dispatcher.cancelarDraftsPendientes(sessionId)`.
  - `stop()` también llama `cancelarDraftsPendientes` para evitar timer leak al salir de la página.
  - Maneja `SimulacroCerradoError` propagado por el dispatcher reusando el branch existente `errorState='cerrado'` + redirect a `/home`.
  - Signal opcional `draftStatus: 'idle' | 'syncing' | 'synced' | 'offline'` para futura UI; en este change NO se renderiza nada visible (la sincronización es silenciosa por design).

**Wiring + flag**
- `app.config.ts`: factory del use case + provider del dispatcher; el provider devuelve un stub no-op cuando `environment.draftEnabled === false`.
- `scripts/build-env.mjs` + `.env.example`: nueva env var `DRAFT_ENABLED` (default `false` si no está seteada), genera `environment.draftEnabled: boolean`.

**Sin cambio:** `EnvioRetryDispatcher`, `credentials.interceptor`, `MarkingsStorage`, `EnviarSimulacroUseCase`, `RetomarEnviosPendientesUseCase`, infra de submit. El draft es **estrictamente aditivo**; el cut-over no toca el camino de envío final.

## Impact

Capabilities OpenSpec:
- **Nueva**: `submit-progress-snapshot` — auto-save progresivo con snapshots completos a Redis. Cubre contrato HTTP, comportamiento del dispatcher (debounce/throttle/coalesce/heartbeat), cancel-on-submit, feature flag, y garantías no-fatal.

Capabilities deltadas:
- `http-client` — **MINOR**: nuevo helper `studentExamDraft`, nueva tabla de clasificación de errores para POST draft, segundo set enumerado de `body.message` (extiende la excepción documentada del submit; misma justificación, alcance acotado).
- `exam-submission` — **MINOR (no-breaking)**: aclaración de que el submit final NO cambia y que el dispatcher cancela drafts pendientes antes del submit. Sin reshape de `EnvioRequest`/`EnvioResult`.

## Out of scope

- UI visible del draft status (`syncing`/`synced`/`offline` con icono). El signal está, no se renderiza. Change futuro si UX lo pide.
- Resync explícito desde el back hacia la PWA (hidratar marcaciones locales con el último snapshot del server). Hoy IDB es la source of truth para la UI; el draft es solo upstream. Resync sería para escenario de cambio de dispositivo intra-sesión, que no aplica.
- Endpoint del tutor `/teacher/.../close-all` con force-close real. Lo deploya el back en paralelo; la PWA NO consume nada nuevo (el alumno solo ve `SESSION_NOT_ACTIVE` cuando intenta marcar tras un force-close).
- Backoff exponencial para 429/5xx in-flight. El throttle 10s + heartbeat 60s cubren el patrón natural. Si el back tira 429 sostenido, drafts se pierden silencioso — aceptable.
- Telemetría de drafts (cantidad de POSTs por sesión, tasa de éxito). Cuando exista un sistema de telemetría general, se agrega.
- Health endpoint para "está deployado el `/draft`". El back avisa por humano cuando esté en Docker local; mientras tanto, feature flag apagado.

## Delivery plan

PR único, **~6 commits quirúrgicos** (≤8 archivos c/u). Budget estimado: ~400 líneas, ~10 archivos. **Riesgo medio** de exceder el budget de 400 líneas: si los tests con timers fake crecen mucho, considerar split en 2 PRs (`feat: L1+L2+L3 sin LR` / `feat: LR + dispatcher + tests`). Decisión final en `tasks.md`.

Sub-agentes:
- `frontend-builder` para integración del dispatcher en `simulacro.view-model`.
- `test-engineer` para los tests con timers fake (debounce/throttle/coalesce).
- `hexagonal-guard` para auditar el boundary del dispatcher (NO debe importar dominio salvo el use case y el port type).

1. `feat(L1): DraftRequest + ExamsApi.guardarDraft + mapeo de errores en comentarios` (~1 archivo).
2. `feat(L2): GuardarDraftUseCase puro` (~1 archivo + factory en app.config).
3. `feat(L3): HttpExamsApi.guardarDraft + apiPath.studentExamDraft + DRAFT_ERROR_MESSAGES + timeout 10s` (~2 archivos).
4. `feat(L3): DraftAutoSaveDispatcher con debounce/throttle/coalesce/heartbeat/cancel-on-submit` (~1 archivo + provider en app.config).
5. `feat(LR): simulacro.view-model gancha notificarCambio + cancelarDraftsPendientes + stop() limpia + draftStatus signal` (~1 archivo).
6. `chore(env): build-env DRAFT_ENABLED + .env.example` (~2 archivos).
7. `test: specs L2 + L3 adapter + L3 dispatcher + LR view-model con timers fake` (~5 archivos; split candidato).

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Timer leak si `stop()` del view-model no cancela drafts pendientes | Med | Test obligatorio del view-model: tras `stop()`, ningún POST se dispara aunque pasen 60s. Documentado en design.md R1. |
| Race draft-en-vuelo vs submit (alumno toca Enviar mientras hay un POST `/draft` en vuelo) | High | Aceptable: el back chequea `sess:{sessionId}:student:{studentId}:final` en Redis antes de upsertear; si existe → 204 no-op silent. Documentado como contrato recibido del back en design.md R2. |
| 404 sin `body.message` durante ventana de deploy del endpoint | Med | Classifier hace silent stop (NO escala al view-model). Feature flag cubre el período de transición. Cuando el back confirme deploy, prendemos el flag. Documentado en design.md R3. |
| Diferencia con `EnvioRetryDispatcher` (NO en APP_INITIALIZER) puede confundir mantenimiento | Low | Comentario en el dispatcher referenciando design.md R4: semánticas opuestas (retry exactly-once durable vs draft best-effort efímero). |
| Inflight POST no abortable con `firstValueFrom` (Angular HttpClient + RxJS) | Low | Aceptable: el dispatcher setea `stopped=true` y el back no-op'ea. Documentado en design.md R5. |
| Excede budget de 400 líneas | Med | Si excede, split en 2 PRs: backend wire (L1+L2+L3+env, ~250 líneas) y dispatcher+LR (~250 líneas). Decisión final en `tasks.md`. |
| Confusión entre `/draft` y `/submit` en el code review | Low | Naming explícito (`GuardarDraftUseCase` vs `EnviarSimulacroUseCase`); set de mensajes separado (`DRAFT_ERROR_MESSAGES` vs `SUBMIT_ERROR_MESSAGES`); paths y comentarios distintos. |

## Rollback plan

1. **Apagar el flag**: setear `DRAFT_ENABLED=false` en `.env` (o no setearlo — default es `false`). El view-model NO inyecta el dispatcher en runtime; cero tráfico al endpoint; cero impacto en el submit final ni en marcaciones IDB.
2. **Revert quirúrgico del PR si el flag no alcanza**: el change es estrictamente aditivo (no toca `EnviarSimulacroUseCase`, `MarkingsStorage`, `credentials.interceptor`, ni los view-models de `/home`). `git revert` del merge commit elimina todo sin migración de datos.
3. **Sin migración de IDB**: el draft no persiste nada localmente; solo manda al server. Revertir no deja huérfanos en IndexedDB.

## Dependencies

- learnex deploy del endpoint `POST /t/{slug}/student/exam-sessions/{sessionId}/draft` en Docker local. Coordinación humana — el back avisa cuando esté listo. Mientras tanto, este change mergea con `DRAFT_ENABLED=false`.
- Rate limit server-side: 30/min por alumno (confirmado con back). Nuestro patrón natural máximo es ~6/min (1 cada 10s con throttle, +1 cada 60s con heartbeat). Holgado.

## Success criteria

- [ ] Alumno marca 1 vez → ~3s después se observa 1 POST con snapshot completo (sin `client_finished_at`).
- [ ] Alumno marca 10 veces en 2s → se observa 1 solo POST coalesced con el snapshot final.
- [ ] Alumno marca constantemente → se observan máx 1 POST cada 10s.
- [ ] Heartbeat 60s dispara solo si hay cambios sin sincronizar (`dirty=true`); sin cambios no hay POSTs.
- [ ] Submit cancela debounce y deja `stopped=true`; cualquier draft que llegue tarde recibe 204 silent.
- [ ] 409 `SESSION_NOT_ACTIVE` → dispatcher se detiene para ese sessionId Y view-model muestra el flujo "cerrado" existente.
- [ ] Sin red durante todo el examen → alumno completa cartilla, submit final funciona idéntico a hoy (drafts se pierden silenciosos, no escalan).
- [ ] Feature flag apagado → cero tráfico al `/draft`, cero impacto en el resto de la app.
- [ ] `npm run lint` limpio; `npm test` verde (tests nuevos pasan; tests existentes intactos).
- [ ] `hexagonal-guard` audit sin observaciones (dispatcher no importa nada de L1 salvo el use case y el port type).
- [ ] Cero literales `"vonex"` en `src/` (regla CLAUDE.md #6).

## Capabilities

> Esta sección es el CONTRATO entre `proposal.md` y `sdd-spec`. El `sdd-spec` agent lee esto para saber exactamente qué specs crear o actualizar.

### New Capabilities

- `submit-progress-snapshot`: auto-save progresivo de snapshots completos del set de respuestas a `POST /draft` durante la cartilla, con debounce/throttle/coalesce/heartbeat, cancel-on-submit, feature flag, y garantías no-fatal para la sesión.

### Modified Capabilities

- `http-client`: agrega helper `apiPath.studentExamDraft` y tabla de clasificación de errores para POST draft con su propio set enumerado de `body.message` (extiende la excepción documentada del submit).
- `exam-submission`: aclaración no-breaking de que el dispatcher cancela drafts pendientes ANTES de cualquier rama del submit, y que el submit final no cambia en este change.
