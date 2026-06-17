# fase-3-exam-submit-learnex — Proposal

- **Status:** proposed
- **Depends on:** `fase-3-exam-list-learnex` (archived 2026-06-16)
- **Unlocks:** Fase 2 backend (calificación + ranking vía SSE), futuro change de "ver comprobante histórico" en /home

## Why

Tras `fase-3-exam-list-learnex`, el listado de simulacros funciona contra learnex pero el POST de envío sigue siendo un **stub síncrono** que lanza `SubmissionNotAvailableError`. La PWA no puede cerrar el ciclo: el alumno marca, toca "Enviar", y el flujo termina silenciosamente sin persistir nada en el server. La cartilla está funcional para marcar pero **no entrega**.

learnex publicó el contrato real del POST (`.authentic/contrato-pwa-submit.md` + handoff del back en este checkpoint): `POST /t/{slug}/student/exam-sessions/{sessionId}/submit`, cookies HttpOnly + `withCredentials: true`, body `{ code, responses, client_finished_at }`, response `{ id, submission_hash, submitted_at }`, idempotencia server-side (primer envío gana). Este change implementa el POST real, persiste el comprobante criptográfico devuelto por el server, y completa el ciclo de envío end-to-end.

Adicionalmente, el comportamiento UX se enriquece: **modal de comprobante** post-201 con el hash visible como bloque, **card "Enviado · Pendiente de calificación"** en /home cableada con el ack real (hoy es dead code), y **reintento 100% automático** del queue offline al volver la conectividad (sin botón manual — el dispatcher existente lo cubre).

## What changes

**L1 dominio**
- `EnvioRequest` (L1 port `ExamsApi`) reshape: rename `clientSubmittedAt → clientFinishedAt`, agregar `code: string` (DNI alumno). `examId` se mantiene como identificador interno → mapea a `{sessionId}` en URL.
- `EnvioResult` reshape: nueva forma `{ id, submissionHash, submittedAt }`. Reemplaza `{ status, clientSubmittedAt, serverReceivedAt }`.
- Nuevo VO `SubmissionAck` (`id`, `submissionHash`, `submittedAt: Date`) — comprobante persistido.
- Nuevo error `StudentNotEnrolledError` (L1) para 403 `STUDENT_NOT_ENROLLED`.
- Reusos: `SimulacroCerradoError` cubre 409 `SESSION_NOT_ACTIVE` (mismo flujo UX). `InvalidSubmissionTimeError` cubre 422 `CLOCK_SKEW_*` (BEFORE_START y TOO_FAR_FUTURE colapsan a misma copy). `SimulacroNoAsignadoError` cubre 404. `InvalidPayloadError` cubre 400 bad_request. 403 `STUDENT_MISMATCH` → branch genérico (sin error class — el back pide UX "error genérico, no revelar").
- **Eliminado** `SubmissionNotAvailableError` (clase + uso): el stub se reemplaza por POST real. Cleanup en L1 + L2 + LR.
- `MarkingsStorage` puerto reshape: `hasSubmittedAck(examId): Promise<boolean>` → `getSubmissionAck(examId): Promise<SubmissionAck | null>` (cabe el comprobante completo, retro-compatible con check booleano usando `=== null`). Nuevo método `setSubmissionAck(examId, ack): Promise<void>`. `wipeUserScope()` debe borrar también los acks.

**L2 use cases**
- `EnviarSimulacroUseCase` reshape principal:
  - Inyecta `IdentityStorage` (nuevo cuarto puerto) — lee `Identity.codigo` internamente para no contaminar view-model.
  - Resuelve `client_finished_at` con el `Clock` server-anchored (rename interno; antes `clientSubmittedAt`).
  - Filtra `null` de `AnswersMap` y reshape de keys (`"1"` → `"P1"`) ANTES de llamar al adapter.
  - Captura `SubmissionAck` del adapter, persiste vía `MarkingsStorage.setSubmissionAck`, luego `clearMarcaciones`.
  - Retorna `{ status: 'enviado' | 'queued', ack: SubmissionAck | null }` (ack solo en path síncrono exitoso; en queued es null hasta que el dispatcher cierre).
- `RetomarEnviosPendientesUseCase`: mismo reshape — al procesar éxito, persiste el ack y borra marcaciones. Existing structure se mantiene; cambia solo el payload del POST y el handling del response.
- `ProgramarAutoEnvioUseCase`: sin cambio de lógica; el callback `onResult` ahora recibe el ack.

**L3 adapter**
- `HttpExamsApi.enviar` reemplaza el stub por POST real:
  - URL via nuevo helper `apiPath.studentExamSubmit(sessionId)` → `/t/${slug}/student/exam-sessions/${sessionId}/submit`.
  - Body shape exacto contrato: `{ code, responses, client_finished_at }`.
  - Clasificación por `(status, body.message)` — el back NO emite `body.code`, sino `body.message` con strings estructurados (`STUDENT_MISMATCH`, `STUDENT_NOT_ENROLLED`, `SESSION_NOT_ACTIVE`, `CLOCK_SKEW_BEFORE_START`, `CLOCK_SKEW_TOO_FAR_FUTURE`). La regla del CLAUDE.md ("nunca leer `message`") se relaja **solo** para estos valores enumerados y documentados del back — son códigos de control, no texto i18n humano. Documentado como excepción en design.
  - 201 → mapear DTO `{ id, submission_hash, submitted_at }` a `SubmissionAck` (parse `submitted_at` ISO a `Date`).
- `IndexedDbMarkingsStorage`: implementa `setSubmissionAck` + `getSubmissionAck`. Clave nueva: `cartilla.<userEmail>.ack.<examId>`. `wipeUserScope` extiende para borrar acks. El método legacy `hasSubmittedAck` ya no existe en el puerto — su único caller (home view-model) migra a `getSubmissionAck`.

**LR render**
- `simulacro.view-model.ts`:
  - `submissionState` agrega valor `'sent-with-ack'` y signal `lastAck: SubmissionAck | null`.
  - Tras 201 exitoso (síncrono o queue procesado mientras está en /simulacro), seta `lastAck` y muestra el modal de comprobante en lugar de navegar inmediato.
  - El modal tiene su propio dismiss → en ese momento navega a `/home`.
  - Cleanup completo del branch `SubmissionNotAvailableError`.
- `home.view-model.ts`:
  - `composeEstado` migra de `hasSubmittedAck(examId): boolean` a `getSubmissionAck(examId): SubmissionAck | null`. Cuando ack !== null → estado `enviado`.
  - `primaryText` para estado `enviado` usa `ack.submittedAt` (hora real del server), formato `"Enviado · HH:MM"`.
  - `secondaryText` para estado `enviado` retorna `"Pendiente de calificación"` (en vez de `area ?? course`).
- Nuevo componente standalone `<app-submission-receipt-modal>` (LR/components):
  - Centrado con backdrop blur (`rgba(28,27,27,0.32)` + `backdrop-filter: blur(6px)`).
  - Check verde, copy "Envío exitoso" + "Pendiente de calificación".
  - Hora del server (`ack.submittedAt` formato `"HH:MM — DD mmm YYYY"`).
  - Hash sha256 en bloque 4×4×4 (4 líneas × 4 grupos × 4 chars hex).
  - Botón único "Volver al inicio" → emite `(close)`.
  - Pulso háptico al aparecer (reutiliza patrón existente del long-press).
- Banner queued de la cartilla: copy actualizado a "Sin conexión. Tus respuestas se enviarán automáticamente cuando vuelva la red." — sin botón manual, el dispatcher cubre todo.

**Sin cambio:** `EnvioRetryDispatcher`, `BrowserConnectivity`, `ServerAnchoredClock`, `credentials.interceptor` — la infra de reconexión ya está cableada desde Fase 2 y funciona tal cual.

## Impact

Capabilities OpenSpec deltadas:
- `exam-submission` — **MAJOR**: reshape de `EnvioRequest`/`EnvioResult`, nuevo flujo de ack, eliminación del stub.
- `offline-storage` — **MINOR**: nuevo método `setSubmissionAck`/`getSubmissionAck` reemplaza el booleano `hasSubmittedAck`; clave IDB nueva para acks.
- `http-client` — **MINOR**: nuevo helper de path `studentExamSubmit`, clasificación de errores por `body.message` (excepción documentada a la regla del CLAUDE.md).
- `exam-marking` — **MINOR**: modal de comprobante, copy del home "Pendiente de calificación", cleanup del branch `SubmissionNotAvailableError`.

## Out of scope

- Backoff exponencial in-flight para 429/500 — el reintento on-reconnect ya cubre el caso real; agregar backoff es hardening posterior.
- Header `X-Pwa-Version` para tracking de versión PWA en el server — el back lo postergó explícitamente ("lo coordinamos aparte, no es bloqueante").
- Ver comprobante histórico tocando una card "enviado" en /home — feature de UX posterior; el ack se persiste, pero la pantalla de detalle es un change futuro.
- Notificación push tras éxito desde el queue procesado en background — overkill para Fase 3.
- Toast efímero "conexión recuperada" cuando vuelve la red mientras está en /simulacro — descartado en checkpoint (UX minimalista, sin sistema global de toasts).
- SSE de `examReady` para refresco automático tras calificación de Fase 2 — el back lo emite, pero la PWA lo consumirá en un change posterior cuando Fase 2 backend esté lista.

## Delivery plan

PR único, ~6 commits quirúrgicos (≤8 archivos c/u). Implementación canalizada por sub-agentes: `frontend-builder` (LR), `test-engineer` (tests), `hexagonal-guard` (auditoría pre-merge).

1. `feat(L1): SubmissionAck VO + EnvioRequest/EnvioResult reshape + StudentNotEnrolledError + drop SubmissionNotAvailableError` (~6 archivos: VO nuevo, port `ExamsApi`, port `MarkingsStorage`, error nuevo, error eliminado + sus referencias en errors index).
2. `feat(L2): EnviarSimulacroUseCase inyecta IdentityStorage + reshape keys + persiste ack + RetomarEnviosPendientesUseCase persiste ack` (~4 archivos).
3. `feat(L3): HttpExamsApi.enviar POST real + apiPath.studentExamSubmit + clasificación de errores` (~3 archivos).
4. `feat(L3): IndexedDbMarkingsStorage setSubmissionAck/getSubmissionAck + wipeUserScope extiende acks` (~2 archivos).
5. `feat(LR): <app-submission-receipt-modal> standalone + simulacro view-model integra modal + home view-model migra a getSubmissionAck + copy "Pendiente de calificación"` (~7 archivos).
6. `chore(LR): cleanup banner queued copy + drop SubmissionNotAvailableError refs en view-models` (~3 archivos).
7. `test: nuevos specs L1/L2/L3/LR del flujo POST + ack + modal` (entregable separado si excede 8 archivos; delegado a `test-engineer`).

## Risks and mitigations

- **Reactivación de ramas dead-code "enviado"**: en `fase-3-exam-list-learnex` la lógica de `composeEstado` con `hasSubmittedAck=true` estaba escrita pero nunca se ejecutaba en runtime. Ahora se activa. Mitigación: tests del view-model con ack mockeado en ambas ramas vivas (`in_progress + ack`, `finalized + ack`); smoke manual con un envío real antes de merge.
- **Excepción a la regla "nunca leer message"**: el back emite `body.message` con strings estructurados (`STUDENT_NOT_ENROLLED`, etc.) en vez de `body.code`. Mitigación: documentar la excepción en `design.md` D-X; lista explícita y cerrada de valores aceptados; cualquier valor no enumerado → `NetworkError`. Coordinación: si el back algún día agrega `body.code`, migramos sin romper.
- **Idempotencia con payload distinto**: el alumno puede tocar Enviar dos veces con respuestas distintas (escenario raro pero posible). El server retorna el hash del PRIMER envío, no del segundo. El alumno guarda un hash que no matchea sus respuestas locales. Mitigación: el modal muestra el hash como autoridad del server ("comprobante" no "checksum local"). Documentado.
- **Modal tras queue procesado**: si el dispatcher procesa el queue mientras el alumno está en `/simulacro`, el modal debe aparecer; si está en `/home` o app cerrada, NO. Mitigación: el use case dispara un signal global de ack; el view-model de `/simulacro` lo observa y muestra el modal solo si el `examId` coincide con el examen activo. Home view-model recompone cards reactivamente cuando los acks cambian, sin modal popup.
- **`IdentityStorage` puede retornar null** (sesión expirada justo al tocar Enviar): el use case rechaza con `SessionExpiredError` antes de intentar el POST. Mitigación: test explícito; UX redirige a /login.
- **Migración de schema IDB**: existing users tienen marcaciones bajo `cartilla.<email>.simulacro.<examId>` pero sin acks (porque hoy `hasSubmittedAck` retorna false). Mitigación: el nuevo namespace `cartilla.<email>.ack.<examId>` no colisiona con el existente. `getSubmissionAck` retorna `null` para examIds sin entrada — es exactamente lo que necesita el view-model.

## Open questions

Ninguna — todo zanjado en el checkpoint:
- Q1 `Exam.id === sessionId` confirmado por back.
- Q2 `IdentityStorage` inyectado en el use case.
- Q3 No mandar versión PWA (back postergó).
- Q4 Solo `StudentNotEnrolledError` nuevo (resto reusa o cae en genérico).
- Reintento queue 100% automático sin botón manual.
