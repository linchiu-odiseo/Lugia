# Tasks — restyle-native-excellence

## 1. Tokens del design system en `:root`

- [x] 1.1 Agregar a `src/styles.scss` un bloque `:root { … }` con todas las CSS Variables de color derivadas del frontmatter de `.authentic/lugia_native_systems/DESIGN.md` (paleta light-mode + semantic + outline-variant + error). Naming `--color-<rol>`.
- [x] 1.2 Agregar tokens de spacing `--space-base` (4 px), `--space-xs` (8), `--space-sm` (12), `--space-md` (16), `--space-lg` (24), `--space-xl` (32) al mismo `:root`.
- [x] 1.3 Agregar tokens de radius `--radius-sm` (4 px), `--radius` (8 px default), `--radius-md` (12), `--radius-lg` (16), `--radius-pill` (9999) al mismo `:root`.
- [x] 1.4 Agregar tokens de tipografía `--font-display` (`'Hanken Grotesk', system-ui, sans-serif`), `--font-body` (igual), `--font-mono` (`'JetBrains Mono', monospace`), `--font-pixel` (`'Press Start 2P', monospace`).
- [x] 1.5 Cambiar el `background` y `color` del `html, body` en `styles.scss` para consumir `var(--color-bg)` y `var(--color-on-surface)`. Verificar que en dev (`npm run dev`) la app arranca y se ve light.
- [x] 1.6 Agregar al `<head>` de `src/index.html` el `<link rel="stylesheet">` de Google Fonts que pide Hanken Grotesk + JetBrains Mono + Press Start 2P + Material Symbols Outlined con `display=swap`.

## 2. Refactor de los `.scss` existentes para consumir tokens

- [x] 2.1 Refactorizar `src/LR_render/app.scss` para usar `var(--color-*)` y `var(--space-*)` en lugar de hex/spacing literales.
- [x] 2.2 Refactorizar `src/LR_render/pages/login/login.page.scss`: reemplazar todos los hex por `var(--color-*)`, todos los `padding/margin/gap` por `var(--space-*)` cuando calzan con la escala, `border-radius` por `var(--radius-*)`, `font-family` por `var(--font-*)`.
- [x] 2.3 Refactorizar `src/LR_render/pages/home/home.page.scss` (mismo criterio que 2.2).
- [x] 2.4 Refactorizar `src/LR_render/pages/simulacro/simulacro.page.scss` (mismo criterio que 2.2).
- [x] 2.5 Refactorizar `src/LR_render/components/connectivity-badge/connectivity-badge.component.scss` (mismo criterio que 2.2).
- [x] 2.6 Ejecutar `grep -rE '#[0-9a-fA-F]{3,8}' src/LR_render --include='*.scss'` y verificar cero matches. Si quedan hex, eliminarlos hasta que el comando devuelva vacío.

## 3. Restyle visual de `LoginPage`

- [ ] 3.1 Ajustar `login.page.scss` al look Native Excellence: contenedor flex column con `justify-content: center` para centrar vertical, max-width ~22 rem, padding lateral `var(--space-lg)`.
- [ ] 3.2 Cambiar `login.page.html` para que los `<label>` muestren label-caps (uppercase, letter-spacing, font-size 12 px) usando una clase `field__label` ya existente o nueva.
- [ ] 3.3 Agregar icon prefix Material Symbols a los inputs (mail para email, lock para password) usando un wrapper `<div class="field__input-wrap">` con posicionamiento absolute del icono.
- [ ] 3.4 Restilear el banner de error (`.error[role="alert"]`) con `var(--color-error-container)` de fondo y `var(--color-on-error-container)` de texto, icono de error a la izquierda.
- [ ] 3.5 Restilear el `<button type="submit">` con fondo `var(--color-primary)`, texto `var(--color-on-primary)`, radius `var(--radius)`, height 48 px, `active:scale(0.98)`.
- [ ] 3.6 Verificar manualmente en dev que `/login` se ve centrado, los campos tienen iconos, el error se ve con paleta correcta, y el botón "Ingresar" cumple touch target.

## 4. Restyle visual de `HomePage` + cita ambient

- [ ] 4.1 Crear `src/LR_render/pages/home/inspirational-quotes.ts` con `INSPIRATIONAL_QUOTES: readonly string[]` (al menos 3 frases iniciales) y la función `randomQuote(): string`.
- [ ] 4.2 Modificar `src/LR_render/view-models/home.view-model.ts` para exponer `readonly quote = signal(randomQuote());`.
- [ ] 4.3 Modificar el `Session` value-object (si aplica) o el shape del view-model para exponer `dni: Signal<string | null>` derivado del response de login. Si `user.dni` no viene en el response actual, el signal devuelve `null` y el template renderiza condicional con `@if`. Cero cambios en specs de auth.
- [ ] 4.4 Refactorizar `home.page.html`:
  - Header reordenado: label-caps "Bienvenido" + `<h1>Hola, {{ vm.name() }}</h1>` + email + DNI condicional debajo, todos con iconos Material Symbols (mail, badge).
  - Bloque `<figure>` con `<blockquote class="quote">{{ vm.quote() }}</blockquote>` (flex 1, centrado, `var(--font-pixel)` 11 px, `var(--color-on-surface-variant)`) + `<img src="img/lugia.png" alt="Lugia" class="quote__img">` a la derecha (80×80).
  - Section "Simulacros de hoy" con label-caps, cards con `<div class="card__strip">` lateral 4 px por estado (gris pendiente/cerrado, verde abierto/enviado), `<div class="card__primary">` con icon estado y label-caps, `<h3 class="card__name">`, `<p class="card__secondary">`.
- [ ] 4.5 Restilear el botón "Cerrar sesión" en footer con borde `var(--color-outline-variant)`, fondo transparente, texto `var(--color-on-surface-variant)`.
- [ ] 4.6 Agregar regla en `home.page.scss` para `.quote` (font-family + size + leading + lowercase + center) y `.quote__img` (`width/height: 80px; object-contain; user-select: none; pointer-events: none`).
- [ ] 4.7 Verificar manualmente en dev que `/home` se ve light, la cita rota al recargar la página, y Lugia se ve a la derecha de la frase.

## 5. Restyle visual de `SimulacroPage` + cambio de comportamiento del toast

- [ ] 5.1 En `simulacro.page.scss` ajustar el `:host` para light mode (`var(--color-bg)`, `var(--color-on-surface)`) y la tipografía a `var(--font-body)`.
- [ ] 5.2 Restyle del header del simulacro: `__area` con label-caps + `var(--color-on-surface-variant)`, `__name` con `var(--font-display)` semibold, `__countdown` con `var(--font-mono)` para los dígitos del countdown. Borde inferior `var(--color-outline-variant)`.
- [ ] 5.3 Restyle de la `.fila`: fondo `var(--color-surface-container-lowest)`, borde `1px solid var(--color-outline-variant)` con `var(--radius-md)`. Estado `--editing` cambia `border-color` a `var(--color-primary)` + tonal layer con primary @ 4% de opacidad.
- [ ] 5.4 Mantener las bubbles como pastilla full-width: `flex: 1`, `min-height: 2.6rem`, `border-radius: var(--radius-pill)`, border `1.5px solid var(--color-outline-variant)`, background `var(--color-surface-container-lowest)`, color `var(--color-on-surface)`. Estado `--marked` con `var(--color-primary)` fill + border + `var(--color-on-primary)` text.
- [ ] 5.5 Eliminar de `src/LR_render/view-models/simulacro.view-model.ts` el signal `showHintToast`, el flag `hintShownInSession`, la constante `HINT_TOAST_VISIBLE_MS` y el `setTimeout` que la consume, los `.set(false)` residuales, y la rama del primer tap fallido que dispara el toast. Mantener intacto: long-press detector, `rowState`, estados locked/editing, queue offline.
- [ ] 5.6 Eliminar de `simulacro.page.html` el bloque `<aside class="hint-toast">` (líneas 60–62 aprox) y el bloque `<span class="fila__hint">` inline debajo de las bubbles (línea 44 aprox).
- [ ] 5.7 Agregar en `simulacro.page.html` dentro de `<div class="fila">` (cuando `vm.rowState(pregunta) === 'editing'`) un nuevo bloque `<span class="row__chip">` con icon Material `edit` + texto "Toca para cambiar".
- [ ] 5.8 Agregar en `simulacro.page.scss` la regla `.row__chip` con `position: absolute; top: -10px; right: var(--space-sm)`, fondo `var(--color-primary)`, color `var(--color-on-primary)`, font-size 10 px label-caps, radius `var(--radius-pill)`, padding `3px var(--space-xs)`. Eliminar también la regla `.hint-toast` (líneas 247+) y la `@keyframes hint-toast-fade-in` (líneas 270+) ya que ningún consumidor las usa.
- [ ] 5.9 Restilear los botones del footer del simulacro (`Volver a inicio` secondary outline + `Enviar` primary fill) usando tokens.
- [ ] 5.10 Restilear el `.queued-banner` con paleta light coherente con el sistema (fondo warning-container, texto on-warning-container, dot warning).
- [ ] 5.11 Verificar manualmente en dev: long-press en una fila marcada → aparece chip "Toca para cambiar" arriba-derecha, tap simple en otra burbuja la cambia, después de 5s sin acción el chip se oculta y la fila vuelve a locked.

## 6. Restyle de `connectivity-badge`

- [ ] 6.1 Refactorizar `connectivity-badge.component.scss` para light mode: estado online con fondo `var(--color-success-container)` o tonal, dot `var(--color-success)`, texto `var(--color-on-surface-variant)` label-caps. Estado offline equivalente con `var(--color-error)`.
- [ ] 6.2 Verificar manualmente en dev que el badge se ve coherente con el resto del shell light, y que la transición online → offline cambia colores sin parpadeo.

## 7. `index.html` + manifest

- [ ] 7.1 En `src/index.html` cambiar `<meta name="theme-color" content="#0b0f17">` por `<meta name="theme-color" content="#1a3a6d">` (primary container).
- [ ] 7.2 En `src/index.html` ajustar `<meta name="apple-mobile-web-app-status-bar-style">` de `black-translucent` a `default`.
- [ ] 7.3 En `public/manifest.json` cambiar `"background_color": "#639af7"` por `"background_color": "#fcf9f8"`.
- [ ] 7.4 Confirmar que `public/img/lugia.png` existe en el repo (el usuario lo mueve manualmente desde `.authentic/lugia.png`). Si está, listo. Si no, bloquear el tasks.md hasta que el asset esté.

## 8. Tests

- [ ] 8.1 Actualizar `tests/feature/LR_render/view-models/simulacro.view-model.spec.ts`: eliminar los tests del bloque `describe` que asseran sobre `showHintToast` y `HINT_TOAST_VISIBLE_MS` (líneas ~640–693, 9 asserts en total: tap sobre locked no marca + dispara showHintToast, timer 4000ms, etc.). Reemplazar por un único test que verifique que el tap simple sobre fila `locked` no muta la marcación NI dispara ningún signal de hint (la ausencia de cambio es la única señal). Si existe un `simulacro.page.spec.ts` que assertea sobre el DOM `.hint-toast` o `.fila__hint`, actualizarlo: eliminar esos asserts y agregar uno que verifique `.row__chip` visible en filas `editing`.
- [ ] 8.2 Agregar test en `tests/feature/**/home.page.spec.ts` (o equivalente) que verifica que `<blockquote class="quote">` renderiza uno de los strings del array `INSPIRATIONAL_QUOTES`.
- [ ] 8.3 Agregar test (unit, sin Angular) en `tests/unit/**/inspirational-quotes.spec.ts` que verifica que `randomQuote()` devuelve un string del array y que el array tiene al menos 1 elemento.
- [ ] 8.4 Ejecutar `npm test` y verificar que TODOS los tests pasan. Si alguno otro test asserta sobre colores hardcoded o snapshot de HTML que cambió, actualizarlo o eliminarlo según el caso.
- [ ] 8.5 Ejecutar `npm run lint` y arreglar cualquier issue de ESLint introducida por el refactor.
- [ ] 8.6 Ejecutar `npm run format:check` y arreglar cualquier issue de Prettier. Si hay muchos, ejecutar `npm run format` para auto-fix.

## 9. Auditoría hexagonal post-refactor

- [ ] 9.1 Verificar que el refactor NO tocó nada en `src/L1_domain/**`, `src/L2_application/**`, ni `src/L3_periphery/**` (excepto cero cambios — el restyle es 100% LR + raíz). `git diff --name-only main` debe listar solo `src/LR_render/**`, `src/styles.scss`, `src/index.html`, `public/manifest.json`, `public/img/lugia.png` y archivos de tests.
- [ ] 9.2 Lanzar el subagente `hexagonal-guard` sobre `src/` y verificar que reporta cero violaciones nuevas.

## 10. Verificación visual end-to-end

- [ ] 10.1 Iniciar dev server (`npm run dev`) y verificar en `http://localhost:4200` (con DevTools en modo móvil iPhone 14 Pro) las tres pantallas: `/login` (centrado vertical + light), `/home` (saludo + email + DNI cuando exista + cita + lugia + cards 4 estados + badge), `/simulacro/:id` (header con countdown mono, bubbles pastilla con marked en azul, long-press → chip).
- [ ] 10.2 Verificar que el status bar de la PWA (en modo standalone) cambia al primary container Lugia Blue.
- [ ] 10.3 Verificar que la frase ambient cambia entre recargas de `/home` (Ctrl+R varias veces).
- [ ] 10.4 Verificar que el chip "Toca para cambiar" aparece tras long-press en una fila ya marcada y desaparece tras 5 s sin acción.
- [ ] 10.5 Build de producción (`npm run build`) sin warnings de bundle size críticos. Verificar tamaño antes/después documentado en el archive report.
