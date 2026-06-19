# draft-auto-save — Design

## Context

`fase-3-exam-submit-learnex` cerró el camino canónico de entrega: el POST `/submit` devuelve 201 con `SubmissionAck` (id, hash, timestamp) y la PWA persiste todo en IDB. Mientras el alumno marca, sin embargo, **el server no ve nada**: las marcaciones viven solo en `cartilla.<email>.simulacro.<examId>` (IndexedDB) hasta que el alumno toca "Enviar". Si el dispositivo se rompe, el storage se limpia, o el tutor hace force-close del aula antes del submit, las marcaciones se pierden silenciosas.

learnex publicó el contrato de `POST /t/{slug}/student/exam-sessions/{sessionId}/draft`: snapshot completo del set de respuestas en cada llamada, persistido en Redis con TTL `(expectedEndAt - now) + 86400` (min 1 día), 204 No Content sin body, idempotente (último snapshot gana). El endpoint coexiste con el `/submit` final: si en Redis ya está la key `sess:{sessionId}:student:{studentId}:final`, el `/draft` retorna 204 sin tocar nada (no-op silent). Race draft-vs-submit resuelta server-side.

Este change agrega el auto-save progresivo de forma **estrictamente aditiva**: no toca `EnvioRetryDispatcher`, `EnviarSimulacroUseCase`, `MarkingsStorage`, ni el `credentials.interceptor`. El dispatcher nuevo vive en L3 y se acopla al view-model de simulacro por dos métodos (`notificarCambio`, `cancelarDraftsPendientes`). Feature flag `DRAFT_ENABLED` controla el cut-over: con el flag apagado, el provider devuelve un stub no-op y la app emite cero tráfico al `/draft`.

## Goals / Non-goals

**Goals**
- POST `/draft` con snapshot completo (`{ code, responses }` snake_case) al endpoint learnex.
- Dispatcher `DraftAutoSaveDispatcher` con debounce 3s + throttle 10s + heartbeat 60s dirty-only, por `sessionId`.
- Cancel-on-submit limpia debounce y marca la sesión como `stopped` antes de cualquier rama del submit.
- Clasificación de errores `(status, body.message)` con set enumerado cerrado, garantía no-fatal para la sesión, excepción `SimulacroCerradoError` (409) que sí escala al view-model.
- Feature flag `DRAFT_ENABLED` con default `false`: cero impacto runtime cuando está apagado.

**Non-goals**
- UI visible del draft status (signal está, render diferido a change futuro).
- Resync desde server hacia PWA (hidratar IDB con último snapshot del back).
- Telemetría de drafts (cantidad, tasa de éxito).
- Migración de IDB schema (draft no persiste local; solo upstream).
- Abortar inflight POST con `AbortSignal` (race aceptada por contrato no-op silent del back).

## Decisions

### D1: `DraftAutoSaveDispatcher` separado de `EnvioRetryDispatcher`

**Chosen.** Servicio nuevo en `src/L3_periphery/envio/draft-auto-save-dispatcher.service.ts`.

Alternativas: (a) extender `EnvioRetryDispatcher` con métodos para draft; (b) reusar el dispatcher de retry como base abstracta.

Rationale: semánticas opuestas. `EnvioRetryDispatcher` es **exactly-once durable**: se suscribe a `Connectivity`, dispara `RetomarEnviosPendientesUseCase`, drena outbox IDB; arranca en APP_INITIALIZER y debe estar vivo desde el bootstrap por si la app abre con cola pendiente. `DraftAutoSaveDispatcher` es **best-effort efímero**: snapshot del estado actual, debounce/throttle, sin cola, sin durabilidad, sin reintento on-reconnect; arranca lazy al primer `notificarCambio` desde el view-model. Mezclar ambos rompe el test suite del retry-dispatcher (250 líneas con su propio escenario) y desnaturaliza una clase de 44 líneas con un solo método público.

### D2: Estado del dispatcher por `sessionId`, no global

**Chosen.** Map interno `private readonly state = new Map<string, DraftState>()`.

Alternativas: (a) singleton con un solo set de campos `dirty/inflight/stopped`; (b) un dispatcher por sessionId instanciado por el view-model.

Rationale: aunque la PWA solo abre una sesión simultánea (la página de simulacro), el dispatcher es `providedIn: 'root'` y vive en memoria entre navegaciones. Si el alumno navega a `/home` y abre otro examen, el dispatcher viejo no debe arrastrar el `stopped` del anterior. Mapa por sessionId es trivial de mantener y evita bug sutil en multi-tab. Costo: ~5 campos × N sesiones (≤2 simultáneas realistas). Negligible.

### D3: Algoritmo debounce/throttle/coalesce/heartbeat

**Chosen.** Estado por sessionId: `{ dirty: boolean, debounceTimer: number | null, lastPostAt: number, inflight: boolean, stopped: boolean }`. Heartbeat global cada 60s recorre el mapa.

Flujo:

`notificarCambio(sessionId)`:
1. `dirty = true`.
2. Si `stopped` → return.
3. Cancela debounce previo (`clearTimeout`), arranca nuevo timer de 3000ms.

Al disparar el debounce timer (`tryFire`):
1. Si `nextRetryAt !== null && now < nextRetryAt` → reagenda al delta restante (`nextRetryAt - now`, backoff).
2. Si `(now - lastPostAt) < 10_000` → reagenda al delta restante (throttle).
3. Si no → `fire(sessionId)`.

El gate efectivo es `max(lastPostAt + 10_000, nextRetryAt ?? 0)`. Ambos restrictores son independientes y ortogonales (D11).

`fire(sessionId)`:
1. Si `inflight || !dirty || stopped` → skip.
2. `inflight = true`, `dirty = false` (orden crítico: bajar `dirty` ANTES de leer IDB; si una marca llega durante el POST, vuelve a poner `dirty = true` y el siguiente debounce dispara otra ronda).
3. `await guardarDraftUC.execute({ examId: sessionId })` (el use case lee snapshot IDB y arma el body).
4. OK → `lastPostAt = now`; `retryCount = 0`; `nextRetryAt = null` (reset backoff); `inflight = false`.
5. `NetworkError` → silencio (`inflight = false`; `dirty` queda como esté); `retryCount += 1`; `nextRetryAt = now + backoffDelay(retryCount)` (ver D11). Reintento gateado por `tryFire`.
6. `SimulacroCerradoError` → `stopped = true`, emite signal al view-model vía callback registrado.
7. Otros errores duros (`InvalidPayloadError`, `StudentNotEnrolledError`, etc.) → `stopped = true`, silencio (el submit final hablará si persiste; el draft no debe interrumpir la sesión).

Heartbeat (`setInterval` global cada 60_000ms):
- Para cada `(sessionId, state)` del mapa: si `state.dirty && !state.inflight && !state.stopped && (state.nextRetryAt === null || now >= state.nextRetryAt)` → `fire(sessionId)`.
- Si no hay nada sucio o si el backoff aún no se cumplió, no-op silencioso.

`cancelarDraftsPendientes(sessionId)`:
1. `clearTimeout(debounceTimer); debounceTimer = null`.
2. `stopped = true`.
3. NO toca `inflight` (no es abortable con `firstValueFrom`; el back hace no-op silent si el submit ya escribió `final`).

Rationale: invariantes simples (`stopped` es terminal por sessionId; `dirty` solo baja en `fire` paso 2; `lastPostAt` se actualiza solo en éxito). Testeable con timers fake. Patrón consistente con `EnviarSimulacroUseCase` (use case puro maneja el reshape; dispatcher solo orquesta).

### D4: Contrato HTTP — `{ code, responses }` snake_case sin `client_finished_at`

**Chosen.** Body exactamente `{ "code": "<DNI>", "responses": "<string compacto de longitud exam.count>" }`. NO incluye timestamp.

Formato del string `responses` — ver D12 para el detalle completo. Resumen: longitud fija igual a `exam.count`; cada char (0-indexed) corresponde a la pregunta en esa posición; valores `A | B | C | D | E` para marcada, `-` para sin marcar.

Alternativa descartada: dict `Record<"P<n>", "A"|...|"E">` (formato original del contrato). Razón: ~9× peso vs string compacto en el body, y más relevante, **~9× peso en RAM de Redis** con N sesiones activas en concurrente. Ver D12.

Alternativa también descartada: agregar `client_finished_at`. Razón: el back confirmó que `/draft` no valida timestamps (no aplica `CLOCK_SKEW_*`). El snapshot es lo más reciente que tiene el alumno; el tutor que haga force-close usa el `expectedEndAt` server-side, no el del PWA. Eliminar el timestamp del body simplifica el code path (no hay 422), reduce el clasificador y elimina el acoplamiento del draft con el `Clock` server-anchored.

Asimetría con el `/submit` final: el submit mantiene el dict `Record<"P<n>", Letter>` (ya en producción con hash y 201). NO se migra. Ver D12 para el rationale.

### D5: Mapeo de errores — set enumerado cerrado `DRAFT_ERROR_MESSAGES`

**Chosen.** Tabla literal en el clasificador L3:

| Status | body.message | Error de dominio | Trato del dispatcher |
|---|---|---|---|
| 400 | (cualquiera) | `InvalidPayloadError` | `stopped = true`, silencio |
| 401 | — | manejado por `credentials.interceptor` | n/a |
| 403 | `STUDENT_NOT_ENROLLED` | `StudentNotEnrolledError` | `stopped = true`, silencio |
| 403 | `STUDENT_MISMATCH` u otro | `NetworkError` (genérico) | silencio, **backoff** (ver D11), dirty queda |
| 404 | `SESSION_NOT_FOUND` | `SimulacroNoAsignadoError` | `stopped = true`, silencio |
| 404 | `STUDENT_BY_CODE_NOT_FOUND` | `StudentNotLinkedError` | `stopped = true`, silencio |
| 404 | sin message conocido | `NetworkError` (genérico) | silencio, **backoff** (ver D11), dirty queda — autoheal si el back deploya mid-sesión |
| 409 | `SESSION_NOT_ACTIVE` | `SimulacroCerradoError` | `stopped = true`, **escala al view-model** |
| 0 / 429 / 5xx / timeout | — | `NetworkError` | silencio, **backoff** (ver D11), dirty queda |
| otros | — | `NetworkError` | silencio, **backoff** (ver D11), dirty queda |

Set cerrado L3: `DRAFT_ERROR_MESSAGES = new Set(['STUDENT_NOT_ENROLLED', 'STUDENT_MISMATCH', 'SESSION_NOT_FOUND', 'STUDENT_BY_CODE_NOT_FOUND', 'SESSION_NOT_ACTIVE'])`.

Alternativa: clasificar solo por status; tratar todo 4xx como silent stop.

Rationale: SimulacroCerradoError tiene UX dedicada que YA existe (`errorState='cerrado'` + redirect a `/home`). Reusarla cuesta nada y le da al alumno información accionable cuando el tutor cierra el aula entre marcas. El resto de los errores son silencio porque interrumpir al alumno por un fallo de auto-save (que él no pidió) es worse-than-no-op. La excepción documentada a la regla "nunca leer message" sigue el mismo patrón que `SUBMIT_ERROR_MESSAGES` de `fase-3-exam-submit-learnex` D5: valores son códigos de control en mayúsculas snake_case, no i18n humano.

### D6: 404 sin `body.message` conocido → `NetworkError` con backoff (autoheal)

**Chosen.** El clasificador trata 404 sin message del enum como `NetworkError`. El dispatcher lo procesa por la vía retryable con backoff exponencial (ver D11), NO con `stopped = true`.

Alternativa descartada: `stopped = true` permanente (silent stop hasta fin de sesión).

Rationale: si el back **regresa** mid-sesión (deploy, restart de Docker local, hipo transitorio), el dispatcher debe poder recuperarse sin tirar todo el examen al tacho. Con backoff, la primera falla espera 30s, segunda 60s, tercera 2min, cuarta 4min, quinta y siguientes 5min (techo). Apenas un POST sale OK, el contador resetea y vuelve al ritmo normal. Cualquier 404-ruta (deploy pendiente) que persista toda la sesión queda capeado en 1 POST cada 5 min — suficientemente bajo para no ser molesto y suficientemente activo para autoheal. El feature flag `DRAFT_ENABLED=false` sigue siendo red de seguridad primaria para el período pre-deploy; el backoff es la defensa secundaria que cubre tanto deploy-pendiente como caídas transitorias bajo la misma rama.

### D7: Feature flag `DRAFT_ENABLED` con provider stub no-op

**Chosen.** `environment.draftEnabled: boolean` generado por `scripts/build-env.mjs` desde env var `DRAFT_ENABLED` (default `false`). En `app.config.ts`, el provider del dispatcher:

```ts
{
  provide: DraftAutoSaveDispatcher,
  useFactory: () => environment.draftEnabled
    ? new DraftAutoSaveDispatcher(/* deps */)
    : new NoopDraftAutoSaveDispatcher(),
}
```

`NoopDraftAutoSaveDispatcher` implementa la misma interfaz pública (`notificarCambio`, `cancelarDraftsPendientes`, signal opcional) con métodos vacíos.

Alternativa: chequear el flag dentro del view-model y no inyectar.

Rationale: el view-model no debería conocer el flag. Inyectar siempre y delegar al stub mantiene el view-model agnóstico, simplifica los tests (mismo path con dispatcher fake) y permite que un cambio futuro prenda el flag sin tocar LR. Patrón ya usado en proyectos hexagonales para feature gating.

### D8: Dispatcher NO en APP_INITIALIZER — arranca lazy desde view-model

**Chosen.** No se invoca `start()` en `app.config.ts`. La primera llamada a `notificarCambio(sessionId)` desde el view-model implícitamente lo activa (crea entry en el mapa, arranca timer). El heartbeat global se arma en el constructor del servicio.

Alternativa: pareo con `EnvioRetryDispatcher` y arrancar en APP_INITIALIZER.

Rationale: no hay nada que drenar al bootstrap (no hay cola). Arrancar en APP_INITIALIZER solo crea overhead si el alumno nunca abre un simulacro en esta sesión. Lazy desde view-model garantiza que el heartbeat solo corre cuando hay sessionId vivo. El constructor del servicio sí arma `setInterval` para el heartbeat, pero recorre un mapa vacío y no-op'ea hasta que llegue el primer `notificarCambio`.

### D9: Use case `GuardarDraftUseCase` puro, no toca queue ni ack

**Chosen.** Nuevo `GuardarDraftUseCase` en `src/L2_application/use-cases/guardar-draft.use-case.ts` con tres puertos: `ExamsApi`, `MarkingsStorage`, `IdentityStorage`. Lee identity → extrae `code`. Lee `getMarcaciones(examId)` → reshape `AnswersMap → responses` (filtra nulls, prefija `P`). Delega `api.guardarDraft({ examId, code, responses })`. NO encola en `enqueueEnvio`, NO persiste ack, NO borra marcaciones.

Alternativa: inlinar la lógica en el dispatcher.

Rationale: el use case es puro y testeable sin Angular ni timers. El dispatcher se enfoca en orquestación (debounce/throttle/heartbeat) y delega el "cómo" al use case. Errores se propagan tal cual desde el use case; el dispatcher los clasifica y decide cuál escala al view-model.

### D10: Excepción documentada a "nunca leer message" — segundo set, mismo patrón

**Chosen.** El adapter L3 lee `body.message` SOLO contra el set `DRAFT_ERROR_MESSAGES` con igualdad estricta. Comentario inline en el clasificador referencia este documento (D5) y el precedente de `SUBMIT_ERROR_MESSAGES`.

Rationale: misma justificación que `fase-3-exam-submit-learnex` D5: valores enumerados como códigos de control, no i18n humano. La excepción está acotada (5 strings literales, ningún `.includes()` ni regex). Si el back agrega un nuevo string, cae a `NetworkError` (silencio) y aprendemos del PR del back.

### D11: Backoff exponencial con reset on success para fallos retryable

**Chosen.** Schedule de espera entre reintentos para fallos `NetworkError`-class (incluye 0/429/5xx/timeout/403 genérico/404 sin message conocido):

| Falla consecutiva | Espera mínima antes del próximo intento |
|---|---|
| 1° | 30s |
| 2° | 1min |
| 3° | 2min |
| 4° | 4min |
| 5° y subsiguientes | 5min (techo) |

Apenas un POST devuelve HTTP 204, el contador resetea a 0; la próxima falla espera 30s otra vez.

Estado adicional por sessionId en `DraftState`:
- `retryCount: number` — fallos consecutivos sin éxito (inicializa 0).
- `nextRetryAt: number | null` — timestamp mínimo del próximo intento permitido (inicializa null).

Interacciones:
- `fire(sessionId)` en `catch (NetworkError)`: `retryCount += 1`; `nextRetryAt = now + BACKOFF_SCHEDULE[min(retryCount-1, 4)]`. NO marca `stopped`.
- `fire(sessionId)` en éxito (204): `retryCount = 0`; `nextRetryAt = null`.
- `tryFire(sessionId)` (gate previo a `fire`): si `nextRetryAt !== null && now < nextRetryAt`, reagenda con `setTimeout(nextRetryAt - now)` y retorna. El throttle de 10s (D3) sigue aplicando en paralelo; el gate efectivo es `max(lastPostAt + 10_000, nextRetryAt)`.
- Heartbeat 60s: respeta `nextRetryAt` (no fire si `now < nextRetryAt`).
- Errores duros (`stopped = true`): NO usan backoff; quedan terminales para esa sesión.

Constante L3: `const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 120_000, 240_000, 300_000]`. Helper inline `backoffDelay(retryCount: number): number = BACKOFF_SCHEDULE_MS[Math.min(retryCount - 1, BACKOFF_SCHEDULE_MS.length - 1)]` cuando `retryCount > 0`.

Alternativa descartada: cadencia plana de 60s (heartbeat) sin backoff. Razón: bajo back caído, son 60 POSTs/hora por alumno × N alumnos = ruido constante. Backoff capa eso en ~12 POSTs/hora por alumno en peor caso (~5min de espera entre intentos).

Rationale: el backoff cubre tanto la fase de **deploy pendiente** (consolida D6 con la misma rama) como las **caídas transitorias** del back (1 minuto sin red, server reiniciando) y el **rate-limiting del back** (429). Es una rama única para "puede recuperarse" vs `stopped=true` que es para "no se va a recuperar (errores de contrato)". Reset on success garantiza que un hipo de 1 minuto no deja al alumno con esperas largas pegadas por el resto del examen.

### D12: `responses` como string compacto de longitud fija (`exam.count`)

**Chosen.** El campo `responses` del body es un **string ASCII de exactamente `exam.count` caracteres**. Char en índice `i` (0-indexed) corresponde a la pregunta `P(i+1)`. Valores válidos por posición: `A | B | C | D | E` para respuesta marcada, `-` (guion ASCII U+002D) para sin marcar.

Validación contractual (server zod): `responses.matches(/^[A-E-]*$/) && responses.length === exam.count`. Regex con `*` para permitir el edge case `exam.count === 0` (string vacío válido). Letras solo mayúsculas — el cliente garantiza el casing antes de mandar.

Ejemplos canónicos:

| Estado del alumno (exam.count = 4) | `responses` enviado |
|---|---|
| P1=E, P2=A, P3=null, P4=C | `"EA-C"` |
| Todas blancas | `"----"` |
| Solo P1=A | `"A---"` |
| Todas marcadas | `"BACDA"` (exam.count = 5) |
| exam.count = 0 (edge) | `""` |

Alternativa descartada (dict original): `Record<"P<n>", Letter>` con keys ausentes para nulls. Pesos comparados para examen de 100 preguntas todas marcadas:
- Dict JSON: ~900 bytes serializado.
- String compacto: ~100 bytes.
- Ratio: ~9× más chico en disco / cable / RAM.

Para 1000 sesiones activas en concurrente (target Vonex en aulas grandes), el ahorro neto en Redis es ~800 KB. Modesto en absoluto pero relevante para multi-tenant con sesiones simultáneas en horario peak.

Server-side (handoff con learnex confirmado):
- Redis guarda el string como `SET key value` sin packear. Lo que Lugia manda es lo que se guarda.
- Unpacking del string a dict ocurre solo en el `/close-all` y en el `/submit-flow` para el INSERT a Postgres. El `submission_hash` del `/submit` y del `/close-all` siguen computándose sobre el dict ordenado (consistencia hash preservada).
- El cache de contexto del alumno (session.count + tenant info) ya estaba siendo cacheado para evitar 3 queries Postgres por draft. Agregar `session.count` al cache para validar `length === exam.count` sin overhead extra.

Implicancia en L2 (`GuardarDraftUseCase`):
- `execute({ examId, count }: { examId: string; count: number })` recibe `count` ahora. El view-model lo pasa via dispatcher (`notificarCambio(sessionId, count)`).
- Reshape interno (`toResponsesString(answers, count)`): array pre-llenado con `-`, sobrescribe posiciones marcadas (1-indexed → 0-indexed), `join('')`.
- Pseudocódigo:
  ```ts
  const arr = new Array<string>(count).fill('-');
  for (const [pregunta, letra] of Object.entries(answers)) {
    if (letra === null) continue;
    const idx = parseInt(pregunta, 10) - 1;
    if (idx >= 0 && idx < count) arr[idx] = letra;
  }
  return arr.join('');
  ```

Implicancia en L3 (`DraftAutoSaveDispatcher`):
- `DraftState` agrega `count: number` (se setea en el primer `notificarCambio`).
- `notificarCambio(sessionId, count)` recibe count y lo guarda en el state.
- En `fire`: `useCase.execute({ examId: sessionId, count: state.count })`.

Asimetría con `/submit`: el submit mantiene su contrato original (`responses: Record<"P<n>", Letter>` + `client_finished_at` + 201 con hash). NO se migra. Razón: el submit ya está en producción, testeado, archivado en `fase-3-exam-submit-learnex`. Migrarlo sería riesgo sin ganancia comparable (el submit es un POST único por examen, no progresivo; el ahorro en RAM Redis es marginal). Aceptar asimetría documentada vs refactor del submit es trade-off conservador.

Rationale principal: optimización temprana en Redis cuando el endpoint todavía no se construyó (oportunidad para coordinar contrato sin re-trabajo del back). Cambio se acordó con learnex en la misma ventana de definición de `/draft`, antes de que `save-draft-responses` use case tenga código.

```
[Alumno marca opción]
        │
        ▼
SimulacroViewModel.marcarRespuesta()
        │
        ├─→ MarkingsStorage.setMarca(...)        (IDB local; source of truth UI)
        │
        └─→ DraftAutoSaveDispatcher.notificarCambio(sessionId)
                │
                ├─ dirty = true
                ├─ stopped? → return
                └─ debounceTimer = setTimeout(3000)

        [3s sin nuevas marcas o throttle delta]
                │
                ▼
        fire(sessionId)
                │
                ├─ inflight = true; dirty = false
                ├─→ GuardarDraftUseCase.execute({ examId: sessionId })
                │       │
                │       ├─→ IdentityStorage.get() → code
                │       ├─→ MarkingsStorage.getMarcaciones(examId) → AnswersMap
                │       ├─ reshape AnswersMap → responses (filter nulls, prefix P)
                │       └─→ ExamsApi.guardarDraft({ examId, code, responses })
                │               │
                │               └─→ POST /t/{slug}/student/exam-sessions/{id}/draft
                │                       (cookies HttpOnly via credentials.interceptor)
                │                       Response: 204 No Content
                │
                ├─ 204 OK → lastPostAt = now; inflight = false
                ├─ NetworkError → silencio; inflight = false; dirty queda
                ├─ SimulacroCerradoError → stopped = true; emite signal al view-model
                └─ otros → stopped = true; silencio

[Heartbeat 60s]
        Para cada (sessionId, state):
                si dirty && !inflight && !stopped → fire(sessionId)

[Alumno toca Enviar]
        SimulacroViewModel.submit()
                │
                ├─→ DraftAutoSaveDispatcher.cancelarDraftsPendientes(sessionId)
                │       (clearTimeout; stopped = true)
                │
                └─→ EnviarSimulacroUseCase.execute(...)   (camino canónico intacto)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/L1_domain/ports/exams-api.ts` | Modify | Agrega `DraftRequest` y método `guardarDraft(req): Promise<void>` en el port. Actualiza bloque de comentarios de mapeo de errores para el nuevo endpoint. |
| `src/L2_application/use-cases/guardar-draft.use-case.ts` | Create | Use case puro. Lee identity + marcaciones, reshape, delega al port. Propaga errores tal cual. |
| `src/L3_periphery/http/api-paths.ts` | Modify | Nuevo método `studentExamDraft(sessionId)`. |
| `src/L3_periphery/http/http-exams-api.ts` | Modify | Implementa `guardarDraft`: POST con body snake_case + clasificador `classifyDraftError` con `DRAFT_ERROR_MESSAGES`. Comentario inline referenciando D10. |
| `src/L3_periphery/envio/draft-auto-save-dispatcher.service.ts` | Create | Dispatcher con estado por sessionId, debounce/throttle/coalesce/heartbeat, signal de cierre. Incluye `NoopDraftAutoSaveDispatcher` exportado para el stub. |
| `src/LR_render/view-models/simulacro.view-model.ts` | Modify | Inyecta dispatcher; engancha `notificarCambio` post-marca, `cancelarDraftsPendientes` pre-submit y en `stop()`. Maneja `SimulacroCerradoError` propagado vía signal. Signal opcional `draftStatus` para UI futura. |
| `src/app.config.ts` | Modify | Provider factory del dispatcher (real vs stub según `environment.draftEnabled`). Factory del `GuardarDraftUseCase`. |
| `scripts/build-env.mjs` | Modify | Lee `DRAFT_ENABLED` con default `false` y genera `environment.draftEnabled: boolean`. |
| `.env.example` | Modify | Documenta `DRAFT_ENABLED=false`. |

## Interfaces / Contracts

```ts
// L1: src/L1_domain/ports/exams-api.ts
export interface DraftRequest {
  examId: string;                                  // sessionId del path
  code: string;                                    // DNI alumno
  responses: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'>;
}

export interface ExamsApi {
  getTodaysExams(): Promise<ExamsListResult>;
  enviar(req: EnvioRequest): Promise<EnvioResult>;
  guardarDraft(req: DraftRequest): Promise<void>;  // 204 No Content
}

// L3: clasificador
const DRAFT_ERROR_MESSAGES = new Set<string>([
  'STUDENT_NOT_ENROLLED',
  'STUDENT_MISMATCH',
  'SESSION_NOT_FOUND',
  'STUDENT_BY_CODE_NOT_FOUND',
  'SESSION_NOT_ACTIVE',
]);

// L3: interfaz pública del dispatcher
export interface IDraftAutoSaveDispatcher {
  notificarCambio(sessionId: string): void;
  cancelarDraftsPendientes(sessionId: string): void;
  readonly closedSessions: Signal<readonly string[]>;  // sessionIds donde el back devolvió 409
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (L1) | (n/a — solo interface) | El port se valida por compilación |
| Unit (L2) | `GuardarDraftUseCase`: reshape AnswersMap (nulls filtrados, prefijo P), identity null → `SessionExpiredError`, propagación de errores del port | Vitest puro con fakes de `ExamsApi`, `MarkingsStorage`, `IdentityStorage` |
| Feature (L3 HTTP) | URL armada con `apiPath.studentExamDraft`, body snake_case sin `client_finished_at`, mapeo completo de la tabla de errores (cada celda un scenario) | Vitest + TestBed + `HttpTestingController` |
| Feature (L3 dispatcher) | Debounce 3s coalesce, throttle 10s, heartbeat 60s dirty-only, cancel-on-submit deja sesión `stopped`, 409 emite signal, 404 sin message → silent stop, race notificarCambio durante inflight conserva dirty | Vitest + `vi.useFakeTimers()` + fake `GuardarDraftUseCase` |
| Feature (LR) | View-model llama `notificarCambio` tras marca exitosa, `cancelarDraftsPendientes` antes de submit y en `stop()`, `SimulacroCerradoError` por signal → branch 'cerrado'; flag apagado → método del stub se llama sin efectos | Vitest + TestBed con dispatcher fake |
| Build/Lint | `npm run lint && npm test && npm run build` limpio | CI gate |

## Migration / Rollout

- **Sin migración de datos.** El draft no persiste local; solo upstream.
- **Cut-over con feature flag.** Mergeamos con `DRAFT_ENABLED=false` (default). Cuando el back confirme deploy del endpoint en Docker local, prendemos `DRAFT_ENABLED=true` en `.env` local; no requiere rebuild si el dev server corre `predev`.
- **Rollback.** Apagar el flag elimina el tráfico. Revert quirúrgico del PR es viable porque el cambio es estrictamente aditivo (no toca `EnviarSimulacroUseCase`, `MarkingsStorage`, ni view-models de `/home`).

## Riesgos / Trade-offs

### R1 — Timer leak si `stop()` del view-model no llama `cancelarDraftsPendientes`

El dispatcher mantiene `setTimeout` y `setInterval` vivos en su estado. Si el view-model navega fuera de `/simulacro` sin invocar `cancelarDraftsPendientes`, el debounce puede dispararse cuando el alumno ya está en `/home`, generando un POST espurio. El heartbeat sí seguiría corriendo (es global), pero `dirty=false` lo neutraliza.

**Mitigación**: test obligatorio del view-model — tras `stop()`, ningún POST se dispara aunque pasen 60s. La implementación del `stop()` del view-model debe invocar `cancelarDraftsPendientes` (regla operacional, no enforce de tipo).

### R2 — Race draft-en-vuelo vs submit (alumno toca Enviar con un POST `/draft` en flight)

Cuando el view-model llama `cancelarDraftsPendientes`, el flag `stopped` se setea pero `inflight` queda como esté. El POST `/draft` ya emitido sigue su curso. Cuando el back lo procesa, si el `/submit` ya escribió `sess:{sessionId}:student:{studentId}:final` en Redis, el back devuelve 204 sin tocar nada (no-op silent). Si el `/draft` llega ANTES del `/submit`, el snapshot se persiste; el `/submit` posterior es la verdad canónica e invalida el draft.

**Mitigación**: aceptado por contrato del back. Documentado en el spec.

### R3 — 404 ambiguo durante deploy del endpoint

Si el back no tiene el `/draft` deployado, devuelve 404 puro (sin `body.message`). El clasificador lo trata como `NetworkError` retryable con backoff (D6 + D11): 30s, 1min, 2min, 4min, 5min (techo). Si el back deploya mid-sesión, el próximo intento sale OK, el contador resetea, y el draft autoheal sin intervención del alumno.

**Mitigación**: feature flag `DRAFT_ENABLED=false` por default es defensa primaria (cero tráfico hasta confirmar deploy). Backoff es defensa secundaria que también cubre caídas transitorias del back y rate-limiting (429). En peor caso (back caído todo el examen), tope de 1 POST cada 5min por alumno.

### R4 — Inflight POST no abortable con `firstValueFrom`

Angular `HttpClient` + `firstValueFrom` no exponen `AbortSignal`. El POST en vuelo no se cancela. Aceptable por R2 (back no-op silent).

**Mitigación**: documentado. Si en el futuro hace falta abortar (ej. para reducir latencia del submit final), migrar a `httpResource` o emparejar con un `Subject` de cancelación.

### R5 — Diferencia con `EnvioRetryDispatcher` (no en APP_INITIALIZER) puede confundir mantenimiento

Dos dispatchers en `src/L3_periphery/envio/` con lifecycles distintos. Un maintainer puede asumir que ambos arrancan en APP_INITIALIZER y romper el otro.

**Mitigación**: comentario explícito en `DraftAutoSaveDispatcher` referenciando este D8 + D1 (semánticas opuestas). Tests del dispatcher cubren ambos lifecycles.

## Open Questions

Ninguna. El alcance quedó cerrado con el back (contrato, mapeo de errores, TTL Redis, race draft-vs-submit, rate limit) y con el usuario (feature flag, signal opcional sin UI visible, dispatcher separado).
