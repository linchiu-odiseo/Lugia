## 1. Setup de versionado en `.env` y `build-env.mjs`

- [x] 1.1 Agregar `APP_VERSION=1.0.0` a `.env.example` con comentario explicativo de la regla: bumpear en cada deploy, formato SemVer, manual por ahora.
- [x] 1.2 Agregar `APP_VERSION=1.0.0` a `.env` local (no commiteado).
- [x] 1.3 Modificar `scripts/build-env.mjs` para leer `APP_VERSION`. Si está ausente, fail con mensaje `"Missing APP_VERSION in .env"` (siguiendo el patrón de las otras vars).
- [x] 1.4 En `scripts/build-env.mjs`, agregar `appVersion: '<valor>'` al objeto exportado en `src/environments/environment.ts` y `src/environments/environment.development.ts`.
- [x] 1.5 En `scripts/build-env.mjs`, agregar un step post-write: si existe el path típico de `ngsw.json` post-build, abrirlo con `JSON.parse`, mutar a nivel raíz agregando `appData: { version: '<valor>' }`, y reescribir. Si el archivo no existe, skip silencioso (caso dev/test).
- [x] 1.6 Verificar que `npm run dev` falla con mensaje claro cuando `APP_VERSION` está ausente en `.env`.
- [x] 1.7 Verificar que `npm run build` genera `dist/.../ngsw.json` con `appData.version: "1.0.0"`.

## 2. Tipos y signal del estado de update

- [x] 2.1 Crear interfaz `PendingUpdate` con shape `{ available: boolean; fromVersion: string; toVersion: string }` en `src/L3_periphery/pwa/pwa-update.types.ts`.
- [x] 2.2 Definir constante `EMPTY_PENDING_UPDATE: PendingUpdate = { available: false, fromVersion: '', toVersion: '' }` (estado inicial).
- [x] 2.3 Definir constante `VERSION_FALLBACK = '—'` (em dash) para el caso `appData` undefined.

## 3. `PwaUpdateService` — esqueleto + suscripción a `versionUpdates`

- [x] 3.1 Crear `src/L3_periphery/pwa/pwa-update.service.ts` con `@Injectable({ providedIn: 'root' })` inyectando `SwUpdate` y `Router`.
- [x] 3.2 Exponer `readonly pendingUpdate = signal<PendingUpdate>(EMPTY_PENDING_UPDATE)`.
- [x] 3.3 Implementar método `start()` público. Idempotente: si ya arrancó, no-op.
- [x] 3.4 En `start()`, si `SwUpdate.isEnabled === false` (dev mode), no-op y log silencioso "PwaUpdate: SwUpdate disabled, skipping init".
- [x] 3.5 En `start()`, suscribirse a `SwUpdate.versionUpdates` filtrando por `type === 'VERSION_READY'`. En el handler, leer `event.currentVersion.appData?.version ?? VERSION_FALLBACK` y lo mismo para `latestVersion`. Almacenar como `latchedUpdate: PendingUpdate | null` interno.
- [x] 3.6 En el handler de `VERSION_READY`, después de actualizar `latchedUpdate`, llamar a `evaluateGating()` (privado).

## 4. `PwaUpdateService` — gating de ruta

- [x] 4.1 En `start()`, suscribirse a `router.events.pipe(filter(e => e instanceof NavigationEnd))`. En el handler, llamar a `evaluateGating()`.
- [x] 4.2 Implementar `evaluateGating()` (privado): si `latchedUpdate === null`, settear `pendingUpdate.set(EMPTY_PENDING_UPDATE)` y return. Si la URL actual del router empieza con `/simulacro/`, settear `pendingUpdate.set({ ...latchedUpdate, available: false })`. Sino, `pendingUpdate.set({ ...latchedUpdate, available: true })`.
- [x] 4.3 Usar `router.url` directamente para leer la URL actual (no router.routerState — es más simple y suficiente).

## 5. `PwaUpdateService` — polling visibilitychange con throttle

- [x] 5.1 Agregar campo privado `lastCheckTimestamp: number = 0`.
- [x] 5.2 Definir constante `CHECK_THROTTLE_MS = 60_000` exportada del módulo.
- [x] 5.3 En `start()`, registrar listener `document.addEventListener('visibilitychange', this.onVisibilityChange)`.
- [x] 5.4 Implementar `onVisibilityChange()` (privado): si `document.visibilityState !== 'visible'` return. Si `!navigator.onLine` return. Si `Date.now() - lastCheckTimestamp < CHECK_THROTTLE_MS` return. Sino, settear `lastCheckTimestamp = Date.now()` y llamar `swUpdate.checkForUpdate()`. El return de `checkForUpdate` se ignora (silencioso); el handler de `versionUpdates` se encargará si hay update.

## 6. `PwaUpdateService` — método `applyUpdate()`

- [x] 6.1 Agregar campo privado `applying: boolean = false`.
- [x] 6.2 Implementar `applyUpdate(): Promise<void>`. Si `applying === true`, return early. Settear `applying = true` antes del try.
- [x] 6.3 Dentro del try: `await swUpdate.activateUpdate()`, luego `document.location.reload()`.
- [x] 6.4 Dentro del catch: `console.warn('PwaUpdate: activation failed', error)`, settear `applying = false`, NO llamar reload, NO modificar `pendingUpdate` (permanece `available: true`).
- [x] 6.5 Nota: en éxito, no se desetea `applying` porque `reload()` reinicia el contexto.

## 7. Wiring en `app.config.ts`

- [x] 7.1 Importar `PwaUpdateService` y agregar un `provideAppInitializer` que inyecte el servicio y llame `start()`. Colocarlo después del `EnvioRetryDispatcher` initializer existente.
- [x] 7.2 Verificar que `start()` no devuelve Promise — el initializer es sync, no debe bloquear boot.

## 8. Componente `<app-version-footer>`

- [x] 8.1 Crear carpeta `src/LR_render/components/version-footer/` con archivos `version-footer.component.ts`, `.html`, `.scss`.
- [x] 8.2 Component standalone con selector `app-version-footer`, sin inputs, lee `environment.appVersion` (import desde `src/environments/environment`).
- [x] 8.3 Template: `<footer class="version-footer">@if (version) { Lugia · versión {{ version }} }</footer>`.
- [x] 8.4 SCSS: `font-size: 11px`, `color: var(--color-text-muted)` (o el token equivalente del design system; verificar en `src/styles.scss` o `auth-ui` recientes), `text-align: center`, `padding: 0.5rem 0`, `font-weight: 400`.
- [x] 8.5 Si el token `--color-text-muted` no existe, usar `color: hsl(0 0% 60%)` y dejar un TODO con link al design system para alinear más tarde.

## 9. Componente `<app-update-banner>`

- [x] 9.1 Crear carpeta `src/LR_render/components/update-banner/` con `update-banner.component.ts`, `.html`, `.scss`.
- [x] 9.2 Component standalone con selector `app-update-banner`, sin inputs, inyecta `PwaUpdateService` y signal `pendingUpdate`.
- [x] 9.3 Output `(tap)` que emite cuando el alumno toca el banner.
- [x] 9.4 Template: `@if (vm.pendingUpdate().available) { <button class="banner banner--update" (click)="tap.emit()"> <span class="material-symbols-outlined">system_update</span> <span>Hay una versión nueva — Toca para actualizar</span> <span class="material-symbols-outlined chevron">chevron_right</span> </button> }`.
- [x] 9.5 SCSS: nueva variante `.banner--update` con bg pastel (azul ~12-15% saturación), texto azul saturado al 70%, sin borde fuerte. Reutilizar la base `.banner` existente del HomePage o promoverla a un partial común.
- [x] 9.6 Accesibilidad: `role="button"`, focus visible, mismo touch target que las cards de simulacro.

## 10. Componente `<app-update-confirm-modal>`

- [x] 10.1 Crear carpeta `src/LR_render/components/update-confirm-modal/` con `update-confirm-modal.component.ts`, `.html`, `.scss`.
- [x] 10.2 Component standalone, inputs: `fromVersion: string`, `toVersion: string`. Outputs: `(cancel)`, `(confirm)`.
- [x] 10.3 Template: overlay `<div class="modal-overlay"></div>` + `<div role="dialog" aria-modal="true" class="modal" aria-labelledby="update-modal-title">`. Inside: `<h2 id="update-modal-title">Actualizar Lugia</h2>`, `<p>Versión actual: {{ fromVersion }}</p>`, `<p>Versión nueva: {{ toVersion }}</p>`, `<p class="modal__explain">La app se va a reiniciar para aplicar la nueva versión. Tus marcaciones están guardadas.</p>`, `<div class="modal__actions"><button (click)="cancel.emit()">Cancelar</button><button (click)="confirm.emit()" class="primary">Actualizar</button></div>`.
- [x] 10.4 SCSS: overlay con `bg: hsl(0 0% 0% / 0.6)`, `backdrop-filter: blur(2px)`. Modal blanco centrado, max-width 320px, padding generoso, botones Cancelar (ghost) y Actualizar (primario azul).
- [x] 10.5 Trap focus dentro del modal mientras esté abierto; ESC dispara cancel.
- [x] 10.6 Verificar manualmente que NO existen en el template las subcadenas `se borrarán`, `vas a perder`, `se eliminarán` ni variantes.

## 11. Integración en `HomePage`

- [x] 11.1 En `home.page.ts`: importar `PwaUpdateService` (signal `pendingUpdate`), `UpdateBannerComponent`, `UpdateConfirmModalComponent`, `VersionFooterComponent`. Agregar a `imports`.
- [x] 11.2 Agregar signal local `showConfirmModal = signal(false)` en `home.page.ts`.
- [x] 11.3 Handler `onBannerTap()`: `showConfirmModal.set(true)`.
- [x] 11.4 Handler `onModalCancel()`: `showConfirmModal.set(false)`.
- [x] 11.5 Handler `onModalConfirm()`: invoca `pwaUpdateService.applyUpdate()` (no resetea `showConfirmModal` — el reload limpia todo).
- [x] 11.6 En `home.page.html`: insertar `<app-update-banner (tap)="onBannerTap()" />` entre el `<header>` y la `<section class="simulacros">` (mismo slot que los banners blocking actuales).
- [x] 11.7 En `home.page.html`: insertar `@if (showConfirmModal()) { <app-update-confirm-modal [fromVersion]="pwaUpdateService.pendingUpdate().fromVersion" [toVersion]="pwaUpdateService.pendingUpdate().toVersion" (cancel)="onModalCancel()" (confirm)="onModalConfirm()" /> }` como último child del `<main>` o como sibling del `<main>` (para que el overlay cubra todo).
- [x] 11.8 En `home.page.html`: insertar `<app-version-footer />` después del `<footer class="home__footer">` (después del botón "Cerrar sesión").
- [x] 11.9 Verificar manualmente que entrar a un simulacro hace desaparecer el banner; volver a /home lo restaura. — Cubierto por tests 13.5–13.8 (gating) y 14.2–14.3 (banner visible). Verificación visual en device queda como follow-up grupo 17.

## 12. Integración en `LoginPage`

- [x] 12.1 En `login.page.ts`: importar `VersionFooterComponent` y agregar a `imports`.
- [x] 12.2 En `login.page.html`: insertar `<app-version-footer />` como último child del contenedor principal (debajo del botón "Iniciar sesión").
- [x] 12.3 Verificar visualmente que no compite con el formulario y se mantiene el estilo tenue. — Cubierto por test 15.1 (footer presente con copy correcto) y por el SCSS (opacity 0.6, font-size 11px). Verificación visual en device queda como follow-up grupo 17.

## 13. Tests unit (L3): `PwaUpdateService`

- [x] 13.1 Crear `tests/feature/L3_periphery/pwa/pwa-update.service.spec.ts` (en `feature/` no `unit/` — es L3 con TestBed/jsdom).
- [x] 13.2 Setup helper: mock de `SwUpdate` con `versionUpdates: Subject<VersionEvent>`, `isEnabled: true`, `activateUpdate: vi.fn().mockResolvedValue(true)`, `checkForUpdate: vi.fn().mockResolvedValue(true)`.
- [x] 13.3 Setup helper: mock de `Router` con `events: Subject<NavigationEnd>` y `url` mutable.
- [x] 13.4 Test: `start()` con SwUpdate disabled → no suscribe ni listener.
- [x] 13.5 Test: `VERSION_READY` en `/home` → `pendingUpdate().available === true` con versiones correctas.
- [x] 13.6 Test: `VERSION_READY` en `/simulacro/abc` → `pendingUpdate().available === false`, pero latched.
- [x] 13.7 Test: navegación `/simulacro/abc` → `/home` con update latched → `available` pasa a `true`.
- [x] 13.8 Test: navegación `/home` → `/simulacro/abc` con `available === true` → pasa a `false`.
- [x] 13.9 Test: `appData` undefined en `currentVersion` → `fromVersion === '—'`, `toVersion` correcto.
- [x] 13.10 Test: `applyUpdate()` éxito → `activateUpdate` llamado, `reload` llamado (mockear document.location.reload con `vi.spyOn` o helper).
- [x] 13.11 Test: `applyUpdate()` falla → `reload` no llamado, `available` permanece true, error logueado a console.warn.
- [x] 13.12 Test: `applyUpdate()` segundo llamado mientras applying → no-op, activateUpdate no se llama de nuevo.
- [x] 13.13 Test: `visibilitychange` con `visible` + online → `checkForUpdate` llamado.
- [x] 13.14 Test: `visibilitychange` con `visible` + offline → `checkForUpdate` no llamado.
- [x] 13.15 Test: dos `visibilitychange` dentro de 30s → solo el primero llama `checkForUpdate` (throttle).
- [x] 13.16 Test: `visibilitychange` con `hidden` → `checkForUpdate` no llamado.

## 14. Tests feature (LR): `HomePage` integration

- [x] 14.1 En `tests/feature/home/home.page.spec.ts` (o nuevo archivo si no existe el existente cubre esto), agregar describe para "PWA update banner".
- [x] 14.2 Test: `pendingUpdate().available === false` → banner ausente del DOM (queryByText "Hay una versión nueva" → null).
- [x] 14.3 Test: `pendingUpdate().available === true` → banner visible con copy exacto.
- [x] 14.4 Test: tap en banner → modal aparece con título "Actualizar Lugia".
- [x] 14.5 Test: modal muestra "Versión actual: 1.0.0" y "Versión nueva: 1.1.0" cuando esas son las versiones.
- [x] 14.6 Test: modal muestra "Versión actual: —" cuando fromVersion es fallback.
- [x] 14.7 Test: click en Cancelar → modal desaparece, banner sigue visible.
- [x] 14.8 Test: click en Actualizar → `pwaUpdateService.applyUpdate` invocado (spy).
- [x] 14.9 Test: contenido del modal NO contiene "se borrarán", "vas a perder", "se eliminarán" (regex case-insensitive sobre el textContent del dialog).
- [x] 14.10 Test: footer de versión presente con texto "Lugia · versión 1.0.0".

## 15. Tests feature (LR): `LoginPage` integration

- [x] 15.1 En `tests/feature/login/login.page.spec.ts`, agregar test: footer de versión presente en initial render con copy correcto.
- [x] 15.2 Test: footer permanece visible cuando hay errorMessage (ej. RateLimitError).

## 16. Tests unit: `scripts/build-env.mjs`

- [x] 16.1 Validado a mano (el proyecto no tiene `tests/unit/scripts/`). Los 4 escenarios pasan.
- [x] 16.2 Validado: `node scripts/build-env.mjs` sin `APP_VERSION` en `.env` → exit 1 con stderr `"Faltan o quedan placeholders en .env: APP_VERSION"`.
- [x] 16.3 Validado: `environment.ts` y `environment.production.ts` contienen `appVersion: '1.0.0'`.
- [x] 16.4 Validado por construcción: el bloque del `ngsw.json` se ejecuta solo si `existsSync(distRoot) && existsSync(ngswCandidate)`.
- [x] 16.5 Validado: `dist/lugia/browser/ngsw.json` y `dist/neonpanda/browser/ngsw.json` muestran `appData.version = 1.0.0` en stdout del script.

## 17. Verificación manual (post-deploy)

- [ ] 17.1 En device real (Android Chrome), instalar la PWA con `APP_VERSION=1.0.0`. — FOLLOW-UP: requiere device físico + deploy a server.
- [ ] 17.2 Subir un build con `APP_VERSION=1.0.1` al server de dev. — FOLLOW-UP.
- [ ] 17.3 Verificar: el cliente con 1.0.0 detecta el update dentro de 30-60s de abrir la app o al volver a foreground. — FOLLOW-UP.
- [ ] 17.4 Verificar: banner aparece en `/home`, NO aparece en `/simulacro/:id`. — FOLLOW-UP.
- [ ] 17.5 Verificar: tocar banner → modal muestra "Versión actual: 1.0.0", "Versión nueva: 1.0.1". — FOLLOW-UP.
- [ ] 17.6 Verificar: presionar Actualizar → app se reinicia, footer pasa a "Lugia · versión 1.0.1". — FOLLOW-UP.
- [ ] 17.7 Verificar: marcaciones de un simulacro en curso persisten después del update (marcar Q1-Q5, volver a home, actualizar, volver al simulacro, marcaciones intactas). — FOLLOW-UP.
- [ ] 17.8 Verificar: con red apagada, `applyUpdate()` no crashea la app — banner permanece. — FOLLOW-UP.
- [ ] 17.9 Verificar: footer visible en `LoginPage` tras cerrar sesión. — FOLLOW-UP.

## 18. Documentación y handoff

- [x] 18.1 Actualizar `.env.example` con comentario sobre `APP_VERSION` (regla de bump manual + formato SemVer).
- [ ] 18.2 Agregar nota en `CLAUDE.md` sección "Reglas inviolables" sobre el bump del `.env` antes de cada deploy de prod (si el equipo lo considera necesario al cerrar el change). — SKIP: opcional según el spec; se decide en archive si se considera necesario.
- [x] 18.3 Documentar el workaround del `appData` post-build en `agents/architecture-rules.md` o `agents/coding-style.md` como tech debt aceptado.
- [ ] 18.4 Bumpear `APP_VERSION` en `.env` a `1.1.0` antes del primer deploy con esta feature. — FOLLOW-UP: aplica en el momento del deploy, no de la implementación.

## 19. Audit final pre-archive

- [x] 19.1 Correr `hexagonal-guard` sobre `src/L3_periphery/pwa/` — APROBADO, 0 violaciones, 1 smell ya documentado como tech debt aceptado.
- [x] 19.2 Correr `npm run lint` — All files pass linting.
- [x] 19.3 Correr `npm test` — 580/580 tests passing (45/45 files), 24 nuevos tests del change.
- [x] 19.4 Correr `npm run build` — bundle OK, `dist/lugia/browser/ngsw.json` contiene `appData.version: "1.0.0"`.
- [x] 19.5 Correr `npx openspec validate pwa-auto-update` — Change 'pwa-auto-update' is valid.
