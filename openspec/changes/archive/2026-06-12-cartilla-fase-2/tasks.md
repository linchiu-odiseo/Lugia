## 1. PWA shell mobile-lite (desde día 1)

- [x] 1.1 Agregar `src/manifest.webmanifest` con nombre, íconos placeholder, theme color y `display: standalone` _(ya existía en `public/manifest.json` desde Fase 1)_
- [x] 1.2 Registrar el manifest en `src/index.html` vía `<link rel="manifest">` _(ya registrado)_
- [x] 1.3 Agregar service worker básico (cacheo del app shell, sin background sync todavía) vía `@angular/service-worker` _(ngsw-config.json + dependency en package.json + serviceWorker en angular.json — falta `npm install` por el usuario)_
- [x] 1.4 Habilitar el SW en `app.config.ts` con `provideServiceWorker` (solo en producción) _(via `!isDevMode()`)_
- [ ] 1.5 Verificar manualmente con DevTools que el manifest se valida y el SW se registra _(pendiente del usuario tras `npm install`)_

## 2. server-time-sync (sin UI)

- [x] 2.1 Definir puerto `Clock` en `src/L1_domain/ports/clock.ts` con `now(): Date`
- [x] 2.2 Definir value-object `ServerTime` en `src/L1_domain/value-objects/server-time.ts` con validación de ISO8601
- [x] 2.3 Implementar adapter `ServerAnchoredClock` en `src/L3_periphery/clock/server-anchored-clock.ts` con `setServerTime(date)` y `now()` aplicando offset
- [x] 2.4 Registrar `Clock` → `ServerAnchoredClock` en `app.config.ts`
- [x] 2.5 Tests unitarios L1+L2 en `tests/unit/clock.spec.ts` (offset cero, offset positivo, offset negativo) — delegar a `test-engineer`

## 3. connectivity-indicator

- [x] 3.1 Definir puerto `Connectivity` en `src/L1_domain/ports/connectivity.ts` con observación reactiva de `isOnline`
- [x] 3.2 Implementar adapter `BrowserConnectivity` en `src/L3_periphery/connectivity/browser-connectivity.ts` usando `navigator.onLine` + eventos `online`/`offline`, exponiendo un Signal _(observer pattern puro: Set<listener>; el componente badge construye su Signal local)_
- [x] 3.3 Registrar `Connectivity` → `BrowserConnectivity` en `app.config.ts`
- [x] 3.4 Crear componente `ConnectivityBadgeComponent` en `src/LR_render/components/connectivity-badge/` que lee el Signal y renderiza verde/rojo — delegar a `frontend-builder`
- [x] 3.5 Insertar el badge en el shell layout (solo visible cuando hay sesión activa) _(visibilidad por ruta: no /login)_
- [x] 3.6 Tests feature L3 en `tests/feature/connectivity.spec.ts` (estado inicial, transición, idempotencia) — delegar a `test-engineer`

## 4. offline-storage

- [x] 4.1 Definir puerto `MarkingsStorage` en `src/L1_domain/ports/markings-storage.ts` con `setMarcacion`, `getMarcaciones`, `clearMarcaciones`, `enqueueEnvio`, `getEnviosPendientes`, `dequeueEnvio`, `wipeUserScope` _(userEmail derivado del SessionStorage internamente — firmas limpias)_
- [x] 4.2 Definir error `OfflineStorageUnavailableError` en `src/L1_domain/errors/offline-storage-unavailable.ts`
- [x] 4.3 Implementar adapter `IndexedDbMarkingsStorage` en `src/L3_periphery/storage/indexed-db-markings-storage.ts` con scope `cartilla.<userEmail>.*` y manejo de IndexedDB no disponible
- [x] 4.4 Registrar `MarkingsStorage` → `IndexedDbMarkingsStorage` en `app.config.ts`
- [x] 4.5 Extender `LogoutUseCase` (L2) para invocar `MarkingsStorage.wipeUserScope(userEmail)` antes de limpiar sesión
- [x] 4.6 Tests unitarios del use case extendido + tests feature del adapter (con jsdom + fake-indexeddb) en `tests/feature/markings-storage.spec.ts` — delegar a `test-engineer` _(suite total 130/130, 26 nuevos)_

## 5. auth-session — bearer rolling refresh (MODIFIED)

- [x] 5.1 Definir `ActualizarBearerSiRenovadoUseCase` en `src/L2_application/auth/actualizar-bearer-si-renovado.ts` que recibe un string opcional y actualiza la sesión persistida si no está vacío _(archivado en `src/L2_application/use-cases/` siguiendo el patrón existente; el path en tasks.md era una sugerencia)_
- [x] 5.2 Extender `auth-headers.interceptor.ts` para leer header `X-New-Bearer` en responses exitosas y despachar el use case
- [x] 5.3 Asegurar que la lógica de logout silencioso ante 401 sigue intacta (no se rompe la modificación) _(el `tap` no consume el evento ni transforma el error; el observable original continúa idéntico)_
- [x] 5.4 Tests feature en `tests/feature/auth-rolling-refresh.spec.ts` (header presente, ausente, vacío, en distintos endpoints) — delegar a `test-engineer` _(8 use case + 8 interceptor + arreglo de auth-headers.spec pre-existente; suite total 146/146)_

## 6. exam-list — entidad + use case + adapter HTTP

- [x] 6.1 Definir entidad `Simulacro` en `src/L1_domain/entities/simulacro.ts` con `id`, `area`, `name`, `count`, `inicio`, `fin`, `estado`
- [x] 6.2 Definir value-object `EstadoSimulacro` en `src/L1_domain/value-objects/estado-simulacro.ts` con `pendiente | abierto | enviado | cerrado` y validación
- [x] 6.3 Definir error `InvalidSimulacroError` en `src/L1_domain/errors/` _(+ `SessionExpiredError` requerido por el adapter)_
- [x] 6.4 Definir puerto `SimulacrosApi` en `src/L1_domain/ports/simulacros-api.ts` con `obtenerDelDia()` y `enviar(simulacroId, answers, clientSubmittedAt)`
- [x] 6.5 Implementar `ObtenerSimulacrosDelDiaUseCase` en `src/L2_application/simulacros/obtener-del-dia.ts` (incluye captura del `serverTime` y entrega al `Clock`) _(ubicado en `use-cases/` siguiendo patrón Fase 1)_
- [x] 6.6 Implementar adapter `HttpSimulacrosApi` en `src/L3_periphery/http/http-simulacros-api.ts` parseando la respuesta y manejando 401 (SessionExpiredError) y errores de red (NetworkError) _(stub explícito en `enviar()` hasta sec.9)_
- [x] 6.7 Registrar `SimulacrosApi` → `HttpSimulacrosApi` en `app.config.ts`
- [x] 6.8 Tests unitarios L1+L2 (entidad, value-object, use case con puerto mock) — delegar a `test-engineer` _(52 tests: 24 Simulacro + 19 EstadoSimulacro + 9 use case)_
- [x] 6.9 Tests feature del adapter con `HttpTestingController` — delegar a `test-engineer` _(17 tests con DTOs parametrizados; suite total 213/213)_

## 7. exam-list — UI en /home

- [x] 7.1 Crear `HomePageViewModel` con Signals: `simulacros`, `isLoading`, `serverError`, `lastRefreshAt` — delegar a `frontend-builder`
- [x] 7.2 Implementar refresh on `visibilitychange` en el view-model — delegar a `frontend-builder`
- [x] 7.3 Implementar polling cada 120s pausado cuando la pestaña no es visible — delegar a `frontend-builder`
- [x] 7.4 Implementar pull-to-refresh gesture en la UI mobile-lite — delegar a `frontend-builder`
- [x] 7.5 Renderizar cada simulacro con su estado: gris (pendiente, enviado, cerrado), verde clickeable (abierto), con countdown server-anchored — delegar a `frontend-builder` _(countdown derivado de `nowTick` con `Clock.now()` + tabular-nums)_
- [x] 7.6 Manejar el caso `OfflineStorageUnavailableError` mostrando banner persistente — delegar a `frontend-builder` _(pre-check vía `markings.getEnviosPendientes()` al `start()`)_
- [x] 7.7 Manejar degradación graceful si llegan dos `abierto` simultáneos (warning + tratar el primero como activo) _(solo `console.warn`; ambos siguen verde clickeable por R2 — spec ajustada)_
- [x] 7.8 Tests feature de `HomePage` (jsdom + TestBed) — delegar a `test-engineer` _(12 view-model + 6 page nuevos; suite total 232/232)_

## 8. exam-marking — entidad + use case + UI

- [x] 8.1 Definir entidad `Marcacion` en `src/L1_domain/entities/marcacion.ts` con `simulacroId`, `pregunta`, `alternativa` _(+ `InvalidMarcacionError`)_
- [x] 8.2 Definir value-object `Alternativa` en `src/L1_domain/value-objects/alternativa.ts` aceptando "A"|"B"|"C"|"D"|"E"|null _(fromString factory + desmarcada() helper + isMarked/equals)_
- [x] 8.3 Definir error `InvalidAlternativaError` en `src/L1_domain/errors/`
- [x] 8.4 Implementar `MarcarRespuestaUseCase` en `src/L2_application/simulacros/marcar-respuesta.ts` usando `MarkingsStorage` _(ubicado en `use-cases/` siguiendo patrón Fase 1)_
- [x] 8.5 Crear ruta `/simulacro/:id` en `app.routes.ts` protegida por `authGuard`
- [x] 8.6 Implementar `SimulacroPageViewModel` con Signals: `simulacro`, `marcaciones`, `countdownRestante` — delegar a `frontend-builder` _(+ ticker 1s detecta expire-during-session y redirige a /home)_
- [x] 8.7 Renderizar grilla de `count` filas con bubbles A–E, marcación inmediata al toque, recuperación al montar — delegar a `frontend-builder` _(toggle: tap same → desmarcar; map denso inicializado por count)_
- [x] 8.8 Implementar guards en el view-model: redirigir a `/home` si estado no es `abierto` con mensaje correspondiente — delegar a `frontend-builder` _(errorState 7 valores discrimina razón; DEUDA: mecanismo de toast en /home para mostrar el mensaje queda fuera de scope Fase 2)_
- [x] 8.9 Botón "Volver a /home" sin envío — delegar a `frontend-builder` _(botón "Enviar" placeholder disabled hasta sec.9)_
- [x] 8.10 Tests unitarios L1+L2 (Marcacion, Alternativa, MarcarRespuestaUseCase) — delegar a `test-engineer` _(39 tests: 15 Marcacion + 12 Alternativa + 12 use case)_
- [x] 8.11 Tests feature de `SimulacroPage` (entrada permitida/bloqueada, marca/desmarca, persistencia) — delegar a `test-engineer` _(26 tests: 20 view-model + 6 page; suite total 305/305)_

## 9. exam-submission — envío + auto-envío T=0

- [x] 9.1 Definir errores `InvalidSubmissionTimeError`, `SimulacroCerradoError`, `SimulacroNoAsignadoError`, `InvalidPayloadError` en `src/L1_domain/errors/`
- [x] 9.2 Extender `HttpSimulacrosApi.enviar()` mapeando 200/409 → éxito, 400 INVALID_TIME → InvalidSubmissionTime, 400 INVALID_SHAPE → InvalidPayload, 403 CLOSED → SimulacroCerrado, 404 → SimulacroNoAsignado _(409 colapsa a éxito vía marker interno; 400 sin code → InvalidPayload)_
- [x] 9.3 Implementar `EnviarSimulacroUseCase` en `src/L2_application/simulacros/enviar-simulacro.ts` (lee marcaciones, calcula `clientSubmittedAt` con `Clock`, intenta POST, encola si falla por red, borra marcaciones tras éxito) _(retorna `status: 'enviado' \| 'queued'`; soporta `clientSubmittedAtOverride` para auto-envío)_
- [x] 9.4 Implementar `RetomarEnviosPendientesUseCase` en `src/L2_application/simulacros/retomar-envios-pendientes.ts` (lee cola, despacha cada envío con su `clientSubmittedAt` original) _(4xx no recuperables: dequeue + clearMarcaciones + log; NetworkError: deja en cola)_
- [x] 9.5 Implementar `ProgramarAutoEnvioUseCase` en `src/L2_application/simulacros/programar-auto-envio.ts` con jitter ±3s y `clientSubmittedAt = fin` _(handle con `cancel()` para el botón Enviar manual)_
- [x] 9.6 Disparar `RetomarEnviosPendientesUseCase` al arrancar la app y cuando `Connectivity.isOnline` cambia a `true` _(L3 `EnvioRetryDispatcher` + `provideAppInitializer` en app.config)_
- [x] 9.7 Integrar `ProgramarAutoEnvioUseCase` en `SimulacroPageViewModel` (programar al entrar, cancelar al enviar manualmente) — delegar a `frontend-builder` _(ticker de expiración se abstiene mientras hay auto-envío vivo o submit en vuelo, evita race con setTimeout)_
- [x] 9.8 Botón "Enviar" en `SimulacroPage` que invoca `EnviarSimulacroUseCase`, navega a `/home` tras éxito — delegar a `frontend-builder` _(idempotente frente a doble click; cancela auto-envío antes de invocar)_
- [x] 9.9 UI de estado "Pendiente de envío..." cuando el envío quedó encolado — delegar a `frontend-builder` _(DEUDA: banner NO rehidrata al volver a la página; estado se pierde con el view-model provider-local)_
- [x] 9.10 Tests unitarios L1+L2 (todos los use cases, mapeo de errores) — delegar a `test-engineer` _(26 tests: 10 enviar + 8 retomar + 8 programar auto-envio)_
- [x] 9.11 Tests feature del flujo completo de envío con `HttpTestingController` — delegar a `test-engineer` _(45 nuevos/refactored: 17 adapter enviar + 10 dispatcher + 22 view-model submit/auto-envio + page providers; suite total 376/376)_

## 10. Actualizar contrato y documentación

- [x] 10.1 Actualizar `agents/api-contract.md` con los dos endpoints nuevos, headers (incluido `X-New-Bearer`), codes, mapeo HTTP→errores
- [x] 10.2 Actualizar `CLAUDE.md` si la estructura del repo cambió (probable: nuevas subcarpetas en L1/L2/L3/LR) _(actualizado el header de fase + stack + cambio activo)_
- [x] 10.3 Anotar en `agents/domain-glossary.md` los términos nuevos: `Simulacro`, `Marcacion`, `Alternativa`, `EstadoSimulacro`, `ClientSubmittedAt`, `ServerTime`, `MarkingsStorage` _(+ Clock, Connectivity, SimulacrosApi, los 7 errores nuevos)_

## 11. Validación final

- [x] 11.1 Correr `npm run lint` y resolver cualquier violación _(All files pass linting)_
- [x] 11.2 Correr `npm test` y resolver cualquier test rojo _(376/376 verde, 35 test files)_
- [x] 11.3 Correr `npm run format:check` _(prettier write aplicado a 50 archivos; check final ok)_
- [x] 11.4 Auditar con `hexagonal-guard` sobre `src/` y resolver violaciones reportadas _(APROBADO sin violaciones críticas; 8 smells documentados en design.md como follow-ups)_
- [x] 11.5 Verificar manualmente el flujo end-to-end con backend mock o API-FAKE real _(10 curl tests contra endpoints reales: login OK, GET /simulacros con 3 estados (abierto/pendiente/cerrado), POST /envio 409 idempotencia, 401 bearer inválido, 404 ID inexistente, 403 CLOSED, 400 INVALID_TIME, 400 INVALID_SHAPE × 2. Todos los `code` presentes. POST 200 directo no testeado por idempotencia previa del dev backend. `X-New-Bearer` no exercised por TTL alto del token recién emitido — no bloqueante)_
- [x] 11.6 (Opcional) Verificar instalable en mobile via `cloudflared` tunnel (per `[[project-mobile-tunnel-choice]]`) _(usuario instaló al home screen del celular; PWA arranca en standalone)_
- [ ] 11.7 Listo para `sdd-verify` y luego `sdd-archive`

## 12. Polish de QA mobile (post 11.5)

> Sección buffer para hallazgos de verificación manual en celular real (cloudflared + PWA instalada). Surge durante 11.5/11.6.

- [x] 12.1 Bloquear auto-traducción del navegador en `src/index.html` — fix de "A B C D E renderizado como notas de solfeo (do, mi)" en Chrome Android con traductor activo. Tres atributos: `lang="es-PE"`, `translate="no"` en `<html>`, y `<meta name="google" content="notranslate" />` en `<head>`.
- [x] 12.2 Pulir feel nativo en standalone: deshabilitar long-press menu (`-webkit-touch-callout: none`) y selección de texto en superficies táctiles (botones, bubbles), preservando `user-select: text` en `input`/`textarea` y mensajes para accesibilidad. (Tap highlight y overscroll ya están desactivados en `styles.scss` desde Fase 1.) _(aplicado en `src/styles.scss`, excepciones para `input`, `textarea`, `[role="alert"]`, `[role="status"]`, `.field__hint`, `.error`)_
- [x] 12.3 Documentar en `docs/` el flujo "instalar al home screen" como camino requerido del alumno para experiencia tipo nativa (vs uso en pestaña). Eventual follow-up Fase 2.x: prompt UI "Instalar esta app" en `/home` usando `beforeinstallprompt`. _(documentado en `docs/phase-2-followups.md` como sección de cabecera)_

- [x] 12.4 Protección contra cambios accidentales en la grilla — view-model: máquina de estados de fila (`unmarked`/`locked`/`editing`). Signals `editingRow`, `hintShownInSession`, `showHintToast`. Métodos `enterEditing(p)`, `exitEditing()`, `rowState(p)`, `dismissHintToast()`. `marcar()` gating: aplica solo en `unmarked`/`editing`; en `locked` dispara el toast la primera vez. Timeout de auto-bloqueo 5s. Cleanup en `stop()`. Spec actualizada en `openspec/changes/cartilla-fase-2/specs/exam-marking/spec.md` (Requirement "Protección contra cambios accidentales" + 5 scenarios + 2 scenarios existentes refactorizados).
- [x] 12.5 Long-press 500ms + visual de estados + toast — page.ts: handlers `onRowPointerDown/Move/Up/Cancel` con threshold 10px + flag `suppressNextClick` para evitar doble acción del mismo gesto. HTML: bind a `<div class="fila">`, clases dinámicas `fila--locked`/`fila--editing`, hint inline `Toca para cambiar — vuelve a bloquearse en 5s` en filas en edición, `<aside class="hint-toast">` con auto-fade a los 4s. SCSS: borde de acento + glow box-shadow en editing, transición 180ms, toast con fade-in animation. Haptic `navigator.vibrate([40])` al entrar a edición (degrada silencioso en iOS / jsdom).
- [x] 12.6 Tests view-model L1+L2 — delegar a `test-engineer`. _(2 tests existentes refactorizados + 16 nuevos en `tests/feature/LR_render/view-models/simulacro.view-model.spec.ts`: transiciones unmarked→locked, locked→editing, auto-lock 5s, switch entre filas, no-op en stopped, toast idempotente, dismiss manual, cleanup de timers en stop.)_
- [x] 12.7 Tests feature de la página — delegar a `test-engineer`. _(8 nuevos en `tests/feature/LR_render/pages/simulacro/simulacro.page.spec.ts`: helper `firePointerEvent` para simular gestos, mock de `navigator.vibrate`, long-press exitoso, cancelación por movimiento >10px, cancelación por release antes de 500ms, no-op en filas unmarked, tap en locked dispara toast sin cambio, tap en editing aplica cambio, supresión del click post-long-press.)_

> **Resultado validación 12.4–12.7**: 400/400 tests verde (35 archivos). `npm run lint` y `npm run format:check` limpios.

> **Hallazgos de QA mobile diferidos a Fase 2.x** (documentados en `docs/phase-2-followups.md`):
>
> - `EnviarSimulacroUseCase` confía en storage opacamente — solo se reproduce con reseed dev (count cambia con mismo id). Fix: pasar `count` y normalizar map. No urgente para prod.
> - `IndexedDbMarkingsStorage` no detecta connection-closed forzoso (DevTools "Clear site data" con página viva). Fix: escuchar `db.onclose` + lazy-reopen. Edge case operacional.

> **Fuera de scope de Fase 2** (decisiones tomadas en QA mobile):
>
> - **Suprimir prompt "¿Guardar contraseña?" de Chrome** — no es suprimible desde la web sin romper accesibilidad o gestores de contraseñas legítimos. PWAs grandes (Twitter/Instagram/Facebook) coexisten con él. Se acepta como ruido de plataforma.
> - **Suprimir warning "contraseña insegura"** — feature del navegador no desactivable por el sitio. Salida real: cambiar el password del usuario de prueba a uno no comprometido (requiere coordinar con backend). DECISIÓN PENDIENTE del usuario.
