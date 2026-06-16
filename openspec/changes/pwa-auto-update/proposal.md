## Why

La PWA instalada en el celular del cliente queda colgada en versiones viejas indefinidamente: el `provideServiceWorker` está activo en `src/app.config.ts:77-80`, pero nadie escucha `SwUpdate.versionUpdates` ni llama a `activateUpdate()`. Resultado: cuando publicamos un build nuevo, el SW lo descarga en background pero nunca lo activa hasta que el alumno cierre TODOS los tabs/instancias de la PWA — algo que en mobile prácticamente nunca pasa. Hoy la única vía documentada para que un cliente reciba un fix es desinstalar y reinstalar la PWA, lo que es inaceptable durante el ciclo de simulacros diarios. Resolverlo ahora desbloquea iteración rápida en producción y previene incidentes operativos durante semanas de evaluación intensiva.

## What Changes

- Agregar `PwaUpdateService` en `L3_periphery` que orquesta detección, gating de ruta y activación de updates del shell. Expone signal `pendingUpdate()` y método `applyUpdate()`.
- Wirear gating por ruta: cuando hay versión nueva detectada y el alumno está en `/simulacro/:id`, postergar el banner hasta que vuelva a `/home`. Mid-cartilla NO se interrumpe.
- Agregar polling adicional en `visibilitychange` para detectar updates cuando la app vuelve a foreground (no solo a los 30s del `registerWhenStable` ya configurado).
- Agregar banner `banner--update` en `HomePage` (estilo azul tenue tipo info, no bloqueante) con copy "Hay una versión nueva — Toca para actualizar".
- Agregar modal de confirmación al tocar el banner: muestra "Versión actual" → "Versión nueva", botones [Cancelar] [Actualizar]. Copy explícito: "La app se va a reiniciar para aplicar la nueva versión. Tus marcaciones están guardadas." (PROHIBIDO mencionar "se borrarán" — técnicamente falso).
- Agregar componente reutilizable `<app-version-footer>` con copy "Lugia · versión {{ env.appVersion }}", visible siempre en `LoginPage` y `HomePage` (gris claro, ~11px, sin negrita).
- Agregar nueva variable `APP_VERSION` al `.env` y `.env.example`. Inicial: `1.0.0` (estado actual post fase-2 y fase-3-login archivados). Se bumpea manualmente por release. `scripts/build-env.mjs` la lee y la propaga a `src/environments/environment.ts` y al campo `appData` del `ngsw.json` generado.
- Si `APP_VERSION` falta en `.env`, el preflight `build-env` SHALL fallar con mensaje claro (mismo patrón que `API_BASE_URL` y `TENANT_SLUG`).

## Capabilities

### New Capabilities
- `pwa-shell-update`: orquesta el ciclo de detección, gating por ruta, presentación y activación de actualizaciones del shell servido por el Service Worker. Cubre el servicio L3 (`PwaUpdateService`), la UX del banner + modal en `HomePage`, el componente `<app-version-footer>`, la inyección de versión vía `.env` → `build-env.mjs` → `environment.appVersion` + `ngsw.json.appData`, y el copy del modal con la garantía "tus marcaciones están guardadas".

### Modified Capabilities
- `auth-ui`: agrega requirement para mostrar el footer de versión `<app-version-footer>` en `LoginPage` (consistencia visual con `HomePage`, permite que el alumno reporte la versión sin estar logueado).

## Impact

**Código nuevo (L3 + LR):**
- `src/L3_periphery/pwa/pwa-update.service.ts` — servicio Angular con `SwUpdate`, signal de estado, gating de ruta, polling visibilitychange.
- `src/LR_render/components/version-footer/` — componente standalone con tres archivos (.ts/.html/.scss).
- `src/LR_render/components/update-banner/` — componente standalone embebido en HomePage.
- `src/LR_render/components/update-confirm-modal/` — modal con overlay, botones, copy.

**Código modificado:**
- `src/LR_render/pages/home/home.page.html` — banner update + footer de versión.
- `src/LR_render/pages/home/home.page.ts` — inyección del `PwaUpdateService`, handler del modal.
- `src/LR_render/pages/login/login.page.html` — footer de versión.
- `src/app.config.ts` — `provideAppInitializer` para arrancar el `PwaUpdateService` (suscribir versionUpdates).
- `scripts/build-env.mjs` — leer `APP_VERSION`, propagar a `environment.ts` y a `ngsw-config.json` mediante un step que inyecte `appData` en el `ngsw.json` post-build.

**Configuración:**
- `.env` y `.env.example` — nueva var `APP_VERSION`.
- `src/environments/environment.ts` — nuevo campo `appVersion: string` (generado por script).
- `ngsw.json` post-build — incluye `appData: { version }` para que `SwUpdate` lo exponga.

**Specs:**
- Nueva: `openspec/specs/pwa-shell-update/spec.md`.
- Delta: `openspec/changes/pwa-auto-update/specs/auth-ui/spec.md` (ADDED requirement: footer de versión en LoginPage).

**Dependencias externas:**
- `@angular/service-worker` ya instalado, no cambia versión.
- Ninguna dep nueva.

**Tests:**
- Unit Vitest del `PwaUpdateService` con `SwUpdate` mockeado vía `Subject<VersionEvent>`.
- Feature tests de banner + modal con `HomePageComponent` y TestBed.
- Sin E2E del SW real (no hay Playwright configurado — queda fuera).

**Riesgos:**
- Auto-envío en `programar-auto-envio.use-case.ts:57` usa `setTimeout` en memoria. Mitigado por gating C: el banner nunca se aplica en `/simulacro/:id`, así que el `setTimeout` no se cancela por un reload generado por SwUpdate. Cuando el alumno vuelve a entrar al simulacro, el view-model re-programa el timer al montarse (comportamiento existente).
- `appData` en `ngsw.json` no está documentado como contrato estable de Angular SW. Mitigación: fallback explícito (muestra "—" en modal si `appData` es `undefined`).

**Sin cambios:**
- `ngsw-config.json` — qué se cachea no se mueve.
- `provideServiceWorker` settings — `registerWhenStable:30000` queda.
- IndexedDB / marcaciones / cola de envíos — no se tocan; sobreviven al reload.
