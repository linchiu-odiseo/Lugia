# Proposal — restyle-native-excellence

## Why

La PWA Lugia hoy luce dark-mode con colores hardcoded en cada `.scss`. Tras cerrar Fase 2 con el comportamiento estable, el siguiente paso natural es alinear la identidad visual al design system **"Native Excellence"** definido en `.authentic/lugia_native_systems/DESIGN.md`: light mode (mimetizando la hoja física de bubbles), paleta Lugia Blue, tipografía Hanken Grotesk + JetBrains Mono, formas disciplinadas (radius 8 px, bubbles pastilla full-width). Sin un sistema de tokens centralizado el restyle es inviable de mantener — cada hex aparece duplicado en 5+ archivos. Este change introduce los tokens (CSS Variables W3C), aplica el restyle pantalla por pantalla y suma una capa ambient discreta en `/home` (cita rotativa + Lugia png) sin tocar ninguna regla de dominio ni contrato HTTP.

## What Changes

- **Sistema de tokens nuevo en `src/styles.scss`** — CSS Variables W3C (`--color-*`, `--space-*`, `--radius-*`, `--font-*`) derivadas del frontmatter del DESIGN.md. Cero dependencias nuevas, cero cambios en `angular.json`.
- **Restyle visual de las 3 pages** (`login`, `home`, `simulacro`) y del componente `connectivity-badge`: cambio de modo (dark → light), todos los hex en `.scss` reemplazados por `var(--token)`.
- **Cita ambient + Lugia png en `/home`** — bloque sutil bajo el saludo: frase tipo splash-Minecraft / epígrafe de libro (Press Start 2P, centrada, alineada con `img/lugia.png` a la derecha). Frase aleatoria por montaje desde array TS editable (`src/LR_render/pages/home/inspirational-quotes.ts`), patrón `php artisan inspire`.
- **DNI condicional en `/home`** — si `Session.dni` existe en el response futuro de api-fake, se renderiza junto al email. Si no, se omite. Sin tocar specs de auth en este change; el campo entra cuando backend lo entregue.
- **BREAKING (UX menor)** — eliminar el hint toast inicial *"Mantén presionada la fila para cambiar tu respuesta"* (componente `.hint-toast` + signal `showHintToast`). Lo reemplaza un chip visual flotante "Toca para cambiar" que aparece sobre filas en estado `editing` — comunicación permanente, no one-shot.
- **`index.html`**: `<meta name="theme-color">` cambia de `#0b0f17` (dark) al primary Lugia Blue del sistema; status bar styles iOS coherentes con light.
- **`public/manifest.json`**: `background_color` de `#639af7` a `#fcf9f8` para que el splash de instalación encadene con el light mode de la app.
- **`public/img/lugia.png`** — nuevo asset (el usuario lo mueve desde `.authentic/lugia.png`).
- **Lo que NO cambia**: zero touches en `L1_domain`, `L2_application`, `L3_periphery`. Comportamiento completo de Fase 1 (login, logout, guards, session storage) y Fase 2 (long-press 500 ms, countdown server-anchored, polling 120 s, focus refresh, pull-to-refresh, queue offline IndexedDB, `X-New-Bearer`, `clientSubmittedAt`) intacto. Sin nuevas rutas, sin bottom nav, sin FAB, sin buscador, sin categorías.

## Capabilities

### New Capabilities

- `design-tokens`: contrato del sistema de tokens visuales como CSS Variables en `:root` de `src/styles.scss`. Define qué tokens existen, cómo se nombran (`--color-*`, `--space-*`, `--radius-*`, `--font-*`) y la regla inviolable de que ningún `.scss` de `LR_render/**` puede usar hex hardcoded — todo va por `var(--token)`.

### Modified Capabilities

- `exam-marking`: **único cambio de requirement real**. El scenario *"Tap simple en burbuja de fila bloqueada no cambia la marca"* hoy describe que la UI muestra un toast `"Mantén presionada la fila para cambiar tu respuesta"` la primera vez por sesión. Ese mecanismo se **elimina**. El nuevo scenario describe que la UI muestra un **chip permanente "Toca para cambiar"** sobre la fila cuando entra a estado `editing` (gesto long-press completado). El indicador `editing` deja de tener hint inline debajo de las bubbles (texto "Toca para cambiar" estaba debajo de la grilla) y pasa a ser el chip flotante arriba. La transición a `editing` mantiene el resalte del borde y la duración de 5 s.

> **Nota:** los specs `auth-ui`, `exam-list` y `connectivity-indicator` **NO requieren delta**. Sus requirements (formularios reactivos, 4 estados, polling 120 s, pull-to-refresh, badge online/offline, etc.) describen comportamiento — y el comportamiento no cambia. El restyle visual de esas capabilities se implementa cumpliendo el contrato de la nueva capability `design-tokens` (todos los `.scss` consumen `var(--token)`). Cambiar colores, fuentes y radius es implementation detail, no spec-level behavior.

## Impact

**Código afectado:**
- `src/styles.scss` (refactor mayor: introducir `:root` con CSS Variables)
- `src/LR_render/app.scss` (uso de vars)
- `src/LR_render/pages/login/login.page.{html,scss}`
- `src/LR_render/pages/home/home.page.{html,scss}`
- `src/LR_render/pages/home/home.view-model.ts` (signal `quote` nuevo)
- `src/LR_render/pages/home/inspirational-quotes.ts` (archivo nuevo)
- `src/LR_render/pages/simulacro/simulacro.page.{html,scss}`
- `src/LR_render/pages/simulacro/simulacro.view-model.ts` (remover `showHintToast`)
- `src/LR_render/components/connectivity-badge/connectivity-badge.component.scss`
- `src/index.html` (theme-color, fonts link, status bar iOS)
- `public/manifest.json` (background_color)
- `public/img/lugia.png` (asset nuevo)
- Tests: actualizar feature tests de `simulacro.page` que asserten sobre `.hint-toast`. Posiblemente nuevo feature test que assert sobre `.row__chip` en filas editing.

**Dependencias / fuentes externas:**
- Google Fonts: agregar `Press Start 2P` al link de `index.html` (Hanken Grotesk + JetBrains Mono + Material Symbols ya están vía DESIGN.md previamente o se agregan aquí).
- Cero `npm` packages nuevos.

**APIs / contratos HTTP:**
- Cero cambios. El restyle no toca `http-client`, `auth-session`, `exam-submission`, ni ninguna comunicación con API-FAKE.

**Especificaciones archivadas:**
- Fase 1 (`auth-*`, `http-client`, `route-protection`, `session-storage`) — sin cambios.
- Fase 2 (`exam-submission`, `offline-storage`, `server-time-sync`) — sin cambios.

**Riesgos:**
- Tests visuales / snapshot tests si los hubiera: necesitarán regeneración.
- iOS Safari: el cambio de `theme-color` y el background del manifest pueden requerir reinstall de la PWA para que se aplique en home screens ya instalados (no es bug del cambio, es comportamiento del SO).
- Si algún usuario interno ya tenía la PWA instalada con dark, verá el restyle de golpe al abrir.

**Referencias visuales aprobadas:**
- `.authentic/lugia_native_systems/DESIGN.md` — fuente de verdad del DS.
- `.authentic/lugia_restyle/index.html` — mockup aprobado por el usuario (tabs Login / Home / Cartilla 1 pastilla). La tab "Cartilla 2 círculo" queda descartada (decisión cerrada: pastilla).
