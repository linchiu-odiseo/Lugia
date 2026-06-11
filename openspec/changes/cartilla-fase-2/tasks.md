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

- [ ] 5.1 Definir `ActualizarBearerSiRenovadoUseCase` en `src/L2_application/auth/actualizar-bearer-si-renovado.ts` que recibe un string opcional y actualiza la sesión persistida si no está vacío
- [ ] 5.2 Extender `auth-headers.interceptor.ts` para leer header `X-New-Bearer` en responses exitosas y despachar el use case
- [ ] 5.3 Asegurar que la lógica de logout silencioso ante 401 sigue intacta (no se rompe la modificación)
- [ ] 5.4 Tests feature en `tests/feature/auth-rolling-refresh.spec.ts` (header presente, ausente, vacío, en distintos endpoints) — delegar a `test-engineer`

## 6. exam-list — entidad + use case + adapter HTTP

- [ ] 6.1 Definir entidad `Simulacro` en `src/L1_domain/entities/simulacro.ts` con `id`, `area`, `name`, `count`, `inicio`, `fin`, `estado`
- [ ] 6.2 Definir value-object `EstadoSimulacro` en `src/L1_domain/value-objects/estado-simulacro.ts` con `pendiente | abierto | enviado | cerrado` y validación
- [ ] 6.3 Definir error `InvalidSimulacroError` en `src/L1_domain/errors/`
- [ ] 6.4 Definir puerto `SimulacrosApi` en `src/L1_domain/ports/simulacros-api.ts` con `obtenerDelDia()` y `enviar(simulacroId, answers, clientSubmittedAt)`
- [ ] 6.5 Implementar `ObtenerSimulacrosDelDiaUseCase` en `src/L2_application/simulacros/obtener-del-dia.ts` (incluye captura del `serverTime` y entrega al `Clock`)
- [ ] 6.6 Implementar adapter `HttpSimulacrosApi` en `src/L3_periphery/http/http-simulacros-api.ts` parseando la respuesta y manejando 401 (SessionExpiredError) y errores de red (NetworkError)
- [ ] 6.7 Registrar `SimulacrosApi` → `HttpSimulacrosApi` en `app.config.ts`
- [ ] 6.8 Tests unitarios L1+L2 (entidad, value-object, use case con puerto mock) — delegar a `test-engineer`
- [ ] 6.9 Tests feature del adapter con `HttpTestingController` — delegar a `test-engineer`

## 7. exam-list — UI en /home

- [ ] 7.1 Crear `HomePageViewModel` con Signals: `simulacros`, `isLoading`, `serverError`, `lastRefreshAt` — delegar a `frontend-builder`
- [ ] 7.2 Implementar refresh on `visibilitychange` en el view-model — delegar a `frontend-builder`
- [ ] 7.3 Implementar polling cada 120s pausado cuando la pestaña no es visible — delegar a `frontend-builder`
- [ ] 7.4 Implementar pull-to-refresh gesture en la UI mobile-lite — delegar a `frontend-builder`
- [ ] 7.5 Renderizar cada simulacro con su estado: gris (pendiente, enviado, cerrado), verde clickeable (abierto), con countdown server-anchored — delegar a `frontend-builder`
- [ ] 7.6 Manejar el caso `OfflineStorageUnavailableError` mostrando banner persistente — delegar a `frontend-builder`
- [ ] 7.7 Manejar degradación graceful si llegan dos `abierto` simultáneos (warning + tratar el primero como activo)
- [ ] 7.8 Tests feature de `HomePage` (jsdom + TestBed) — delegar a `test-engineer`

## 8. exam-marking — entidad + use case + UI

- [ ] 8.1 Definir entidad `Marcacion` en `src/L1_domain/entities/marcacion.ts` con `simulacroId`, `pregunta`, `alternativa`
- [ ] 8.2 Definir value-object `Alternativa` en `src/L1_domain/value-objects/alternativa.ts` aceptando "A"|"B"|"C"|"D"|"E"|null
- [ ] 8.3 Definir error `InvalidAlternativaError` en `src/L1_domain/errors/`
- [ ] 8.4 Implementar `MarcarRespuestaUseCase` en `src/L2_application/simulacros/marcar-respuesta.ts` usando `MarkingsStorage`
- [ ] 8.5 Crear ruta `/simulacro/:id` en `app.routes.ts` protegida por `authGuard`
- [ ] 8.6 Implementar `SimulacroPageViewModel` con Signals: `simulacro`, `marcaciones`, `countdownRestante` — delegar a `frontend-builder`
- [ ] 8.7 Renderizar grilla de `count` filas con bubbles A–E, marcación inmediata al toque, recuperación al montar — delegar a `frontend-builder`
- [ ] 8.8 Implementar guards en el view-model: redirigir a `/home` si estado no es `abierto` con mensaje correspondiente — delegar a `frontend-builder`
- [ ] 8.9 Botón "Volver a /home" sin envío — delegar a `frontend-builder`
- [ ] 8.10 Tests unitarios L1+L2 (Marcacion, Alternativa, MarcarRespuestaUseCase) — delegar a `test-engineer`
- [ ] 8.11 Tests feature de `SimulacroPage` (entrada permitida/bloqueada, marca/desmarca, persistencia) — delegar a `test-engineer`

## 9. exam-submission — envío + auto-envío T=0

- [ ] 9.1 Definir errores `InvalidSubmissionTimeError`, `SimulacroCerradoError`, `SimulacroNoAsignadoError`, `InvalidPayloadError` en `src/L1_domain/errors/`
- [ ] 9.2 Extender `HttpSimulacrosApi.enviar()` mapeando 200/409 → éxito, 400 INVALID_TIME → InvalidSubmissionTime, 400 INVALID_SHAPE → InvalidPayload, 403 CLOSED → SimulacroCerrado, 404 → SimulacroNoAsignado
- [ ] 9.3 Implementar `EnviarSimulacroUseCase` en `src/L2_application/simulacros/enviar-simulacro.ts` (lee marcaciones, calcula `clientSubmittedAt` con `Clock`, intenta POST, encola si falla por red, borra marcaciones tras éxito)
- [ ] 9.4 Implementar `RetomarEnviosPendientesUseCase` en `src/L2_application/simulacros/retomar-envios-pendientes.ts` (lee cola, despacha cada envío con su `clientSubmittedAt` original)
- [ ] 9.5 Implementar `ProgramarAutoEnvioUseCase` en `src/L2_application/simulacros/programar-auto-envio.ts` con jitter ±3s y `clientSubmittedAt = fin`
- [ ] 9.6 Disparar `RetomarEnviosPendientesUseCase` al arrancar la app y cuando `Connectivity.isOnline` cambia a `true`
- [ ] 9.7 Integrar `ProgramarAutoEnvioUseCase` en `SimulacroPageViewModel` (programar al entrar, cancelar al enviar manualmente) — delegar a `frontend-builder`
- [ ] 9.8 Botón "Enviar" en `SimulacroPage` que invoca `EnviarSimulacroUseCase`, navega a `/home` tras éxito — delegar a `frontend-builder`
- [ ] 9.9 UI de estado "Pendiente de envío..." cuando el envío quedó encolado — delegar a `frontend-builder`
- [ ] 9.10 Tests unitarios L1+L2 (todos los use cases, mapeo de errores) — delegar a `test-engineer`
- [ ] 9.11 Tests feature del flujo completo de envío con `HttpTestingController` — delegar a `test-engineer`

## 10. Actualizar contrato y documentación

- [ ] 10.1 Actualizar `agents/api-contract.md` con los dos endpoints nuevos, headers (incluido `X-New-Bearer`), codes, mapeo HTTP→errores
- [ ] 10.2 Actualizar `CLAUDE.md` si la estructura del repo cambió (probable: nuevas subcarpetas en L1/L2/L3/LR)
- [ ] 10.3 Anotar en `agents/domain-glossary.md` los términos nuevos: `Simulacro`, `Marcacion`, `Alternativa`, `EstadoSimulacro`, `ClientSubmittedAt`, `ServerTime`, `MarkingsStorage`

## 11. Validación final

- [ ] 11.1 Correr `npm run lint` y resolver cualquier violación
- [ ] 11.2 Correr `npm test` y resolver cualquier test rojo
- [ ] 11.3 Correr `npm run format:check`
- [ ] 11.4 Auditar con `hexagonal-guard` sobre `src/` y resolver violaciones reportadas
- [ ] 11.5 Verificar manualmente el flujo end-to-end con backend mock o API-FAKE real
- [ ] 11.6 (Opcional) Verificar instalable en mobile via `cloudflared` tunnel (per `[[project-mobile-tunnel-choice]]`)
- [ ] 11.7 Listo para `sdd-verify` y luego `sdd-archive`
