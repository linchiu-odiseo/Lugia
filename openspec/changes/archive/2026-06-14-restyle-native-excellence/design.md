# Design — restyle-native-excellence

## Context

Lugia llega a este change con Fase 1 y Fase 2 archivadas y un look funcional pero arbitrario: dark-mode hard (`#0b0f17` bg, `#f1f5f9` text), colores hex repetidos en cada `.scss` de `LR_render/**`, tipografía Inter por defecto del sistema, sin tokens. Toda la disciplina hexagonal (L1/L2/L3 puros, contratos HTTP, queue offline, countdown server-anchored) está sólida — los 400 tests pasan. La debilidad es exclusivamente cosmética y de mantenibilidad: cualquier ajuste de paleta hoy implica buscar y reemplazar `#10b981` en 5 archivos.

Paralelamente, el equipo de diseño produjo el documento `.authentic/lugia_native_systems/DESIGN.md` definiendo el design system **Native Excellence**: light-mode (mimetizando la hoja física de bubbles), paleta Lugia Blue, Hanken Grotesk + JetBrains Mono, radius 8 px, bubbles OMR pastilla full-width, sin sombras (solo outlines + tonal layers), Material Symbols. El usuario aprobó el mockup `.authentic/lugia_restyle/index.html` con 4 tabs (Login, Home, Cartilla 1 pastilla, descartado Cartilla 2 círculo).

Este change traduce ese mockup a la PWA real, con el constraint duro de no romper nada de lo archivado. El stakeholder único es el alumno preuniversitario en aula supervisada — el restyle debe sentirse "más serio, menos app moderna, más cartilla impresa".

## Goals / Non-Goals

**Goals:**

- Introducir un sistema de tokens basado en **CSS Variables W3C** (`:root { --token: value }`) consumidos por todos los `.scss` de `LR_render/**`. Cero deps nuevas, cero cambios en `angular.json`, encaja con SCSS existente.
- Aplicar la paleta light-mode, tipografías Hanken Grotesk + JetBrains Mono + Press Start 2P, iconos Material Symbols Outlined, radius 8 px, bubbles pastilla full-width.
- Mantener inviolable: comportamiento Fase 1 + Fase 2 (login flow, guards, polling, focus refresh, pull-to-refresh, long-press 500 ms, queue offline IndexedDB, `X-New-Bearer`, `clientSubmittedAt`, countdown server-anchored).
- Sustituir el hint toast inicial *"Mantén presionada…"* por un chip visual permanente "Toca para cambiar" sobre filas en estado `editing`.
- Sumar una capa ambient discreta en `/home`: cita rotativa estática (array TS editable, patrón `php artisan inspire`) + `lugia.png` 80×80 a la derecha.

**Non-Goals:**

- No introducir Tailwind, PostCSS extra, ni librerías de DS (Material Components, ng-zorro, etc.).
- No cambiar el shape de los DTOs HTTP, los contratos de los puertos, los use cases ni las entidades de dominio.
- No agregar nuevas rutas Angular, bottom nav, FAB, buscador, categorías de simulacro.
- No tocar specs de Fase 1 (`auth-*`, `http-client`, `route-protection`, `session-storage`), ni el shape de specs de Fase 2 (`exam-list`, `exam-submission`, `offline-storage`, `server-time-sync`, `connectivity-indicator`).
- No implementar backup, cloud sync, ni dynamic frase loading desde backend (la frase es estática local; rotación dinámica futura).
- No introducir dark mode toggle ahora (los tokens lo dejan barato para después).
- No tocar la lógica del countdown ni del long-press detector — solo cambia el chrome visual y el hint.

## Decisions

### D1 — Tokens como CSS Variables W3C, definidos en `src/styles.scss`

**Decisión:** todos los tokens visuales viven en un `:root { … }` único en `src/styles.scss`. Los `.scss` de `LR_render/**` los consumen vía `var(--token)`. Convención de nombres:

- `--color-<rol>` — ej. `--color-primary`, `--color-bg`, `--color-on-surface`, `--color-success`, `--color-outline-variant`. Derivados del frontmatter del DESIGN.md.
- `--space-<size>` — `--space-base` (4 px), `--space-xs` (8 px), `--space-sm` (12 px), `--space-md` (16 px), `--space-lg` (24 px), `--space-xl` (32 px).
- `--radius-<size>` — `--radius-sm` (4 px), `--radius` (8 px default), `--radius-md` (12 px), `--radius-lg` (16 px), `--radius-pill` (9999 px).
- `--font-display`, `--font-body`, `--font-mono`, `--font-pixel`.

Regla inviolable: ningún `.scss` de `src/LR_render/**` puede contener un hex literal. Validable con un grep en CI / lint pre-commit (`grep -rE '#[0-9a-fA-F]{3,6}' src/LR_render/`).

**Alternativas consideradas y descartadas:**

- *Tailwind v3 + tokens config*: agrega 3 deps + `tailwind.config.js` + ajustes en `angular.json` + cambia el patrón de SCSS+BEM ya establecido a utility-first en templates. Beneficio neto cero porque los HTMLs Stitch igual deben re-escribirse como templates Angular.
- *SCSS maps/variables*: funciona pero los tokens quedan inmutables en build-time. CSS Variables permiten override dinámico (dark mode futuro, theming por curso/colegio, A11y zoom) sin recompilar.

### D2 — Bubbles OMR pastilla full-width (decisión del usuario)

**Decisión:** mantener la forma pastilla del SCSS original (`flex: 1; min-height: 2.6rem; border-radius: 9999px; padding: 0.4rem 0`). En estado `marked`, fill `var(--color-primary)` + border `var(--color-primary)` + color `var(--color-on-primary)`. Estado `locked` no overrides — la marca es suficiente comunicación. Estado `editing` aplica al `.fila`, no a las bubbles individuales.

**Alternativas consideradas y descartadas:**

- *Círculo 48×48 fijo (mockup Cartilla 2)*: aunque casa mejor con la metáfora de hoja OMR de papel y con el DESIGN.md ("perfectly circular to match traditional paper answer sheets"), el usuario eligió pastilla por touch target garantizado y look más consistente con el resto del shell.

### D3 — Chip "Toca para cambiar" sobre filas editing, eliminación del toast inicial

**Decisión:** la fila en estado `editing` muestra un chip pequeño absolute-positioned `top: -10px; right: 12px`, fondo `var(--color-primary)`, texto `var(--color-on-primary)` 10 px label-caps, con ícono Material Symbol `edit` 12 px. El chip aparece junto con el borde resaltado, dura los 5 s del editing y desaparece cuando la fila vuelve a `locked` (sea por tap o por timeout).

El toast inicial *"Mantén presionada la fila para cambiar tu respuesta"* (componente `.hint-toast`, signal `showHintToast`, scenario en `exam-marking`) se elimina por completo. Razón: redundancia con el chip permanente. El alumno que intenta tap simple sobre una fila bloqueada simplemente no ve nada cambiar; cuando descubra el long-press (por tutorial del profe, prueba personal, o accidente), el chip aparece y comunica la acción cada vez.

**Impacto en código:**
- `simulacro.view-model.ts`: remover signal `showHintToast`, remover lógica de "primera vez por sesión".
- `simulacro.page.html`: remover bloque `<aside class="hint-toast">`, remover bloque `<span class="fila__hint">` inline.
- Agregar bloque `<span class="row__chip">` dentro de `<div class="fila">` cuando `vm.rowState(pregunta) === 'editing'`.
- Feature test `simulacro.page.spec.ts`: actualizar asserts que verifican `.hint-toast`. Agregar assert de chip visible en editing.

**Alternativas consideradas y descartadas:**

- *Mantener toast + agregar chip*: ruido. El chip ya comunica, el toast se vuelve "tutorial duplicado".
- *Solo cambio visual del toast (mover arriba, achicar)*: el problema no era estético, era conceptual — "anunciar la primera vez algo que el alumno descubrirá por el chip" es información redundante.
- *Mover el "Toca para cambiar" debajo de las bubbles (estado actual del scenario)*: el usuario explícitamente rechazó esa ubicación porque desbalancea la altura de la fila editing vs el resto.

### D4 — Cita ambient + Lugia png en `/home`, frases en array TS

**Decisión:** bajo el header (saludo + email + DNI opcional) del home, un bloque `<figure>` con dos hijos en flex row:

- `<blockquote>` con la frase, `font-family: var(--font-pixel)` (Press Start 2P), `text-align: center`, `flex: 1`, `font-size: 11px`, `line-height: 1.95`, `lowercase`, color `var(--color-on-surface-variant)`.
- `<img src="img/lugia.png" alt="Lugia" />` 80×80, `object-contain`, `shrink-0`, `select-none`, `pointer-events-none`.

Frases viven en `src/LR_render/pages/home/inspirational-quotes.ts`:

```ts
export const INSPIRATIONAL_QUOTES: readonly string[] = [
  'la diferencia entre el que pasa y el que no son los días en que nadie estaba viendo',
  // … el usuario edita acá.
];

export function randomQuote(): string {
  return INSPIRATIONAL_QUOTES[Math.floor(Math.random() * INSPIRATIONAL_QUOTES.length)];
}
```

El view-model del home:

```ts
readonly quote = signal(randomQuote());
```

Una frase nueva por cada vez que `HomePageComponent` se monta (navegación a `/home`, refresh de la página, install fresh). NO rota durante el polling de 120 s — sería distractor.

Lugia png vive en `public/img/lugia.png` (el usuario lo mueve manualmente desde `.authentic/lugia.png`). Cuando el GIF reemplace al PNG, mismo path, solo cambia la extensión.

**Alternativas consideradas y descartadas:**

- *Página intermedia `/bienvenida` entre login y home*: 1 tap extra antes del examen. Rechazado por contexto de aula (el profe dice "abran la app, ya").
- *Cargar frases desde un JSON en `public/`*: tooling-overhead innecesario para "frases que cambian raramente". TS const con type safety es más simple.
- *Cargar frases del backend*: requiere endpoint nuevo, network call extra, dependencia online. Para una capa ambient sin valor crítico es sobreingeniería.
- *Rotación cada polling 120 s*: distractor durante uso real. Una por mount es el balance.

### D5 — `index.html` y `manifest.json` reflejan light mode

**Decisión:**

- `index.html` `<meta name="theme-color">` cambia de `#0b0f17` a `#1a3a6d` (el `primary-container` Lugia Blue). Esto pinta la barra de estado de Android al abrir la PWA en standalone con un azul que combina con el header light.
- `<meta name="apple-mobile-web-app-status-bar-style">` queda `default` (status bar visible con contenido oscuro sobre fondo claro) en vez de `black-translucent`. Considerar `default` o `dark-content` según legibilidad en iOS.
- `manifest.json` `background_color` cambia de `#639af7` (el celeste del favicon) a `#fcf9f8` (light surface). El splash de instalación deja de ser celeste para encadenar con la app real.

### D6 — Refactor en commits separados por capa, cero downtime

**Decisión:** el restyle se aplica en orden estricto del más abajo al más arriba para que el sistema esté funcional en cada commit:

1. Tokens en `styles.scss` (no consumidos todavía — el cambio es aditivo).
2. Refactor de `app.scss` y `LR_render/**` para consumir `var(--token)` en vez de hex.
3. Restyle pantalla por pantalla: login, home, simulacro, connectivity-badge.
4. Cambio de comportamiento `exam-marking`: remover hint toast + agregar chip.
5. `index.html` + `manifest.json` actualizados al final.

Cada paso compila independientemente. Si algo falla, revertir el último commit deja la app usable.

## Risks / Trade-offs

- **PWAs ya instaladas en celulares de prueba se actualizan en cold start**. El alumno verá el cambio de golpe — no es bug, es comportamiento esperado. Mitigation: documentar en el archive report que la primera carga post-deploy puede sentirse "distinta" en dispositivos con cache vieja del service worker.
- **iOS Safari ignora `theme-color` en muchas versiones**. El status bar puede quedar default blanco. Mitigation: el cambio mejora Android sin empeorar iOS. Aceptable.
- **Press Start 2P es solo uppercase nativo (renderiza minúsculas como mayúsculas en su glyph map)**. La frase pixelada va a verse en CAPS aunque el string esté `lowercase`. Mitigation: aceptado — encaja con el estilo "splash Minecraft". El `lowercase` queda como hint semántico.
- **Eliminar el toast podría sorprender a alumnos que ya conocían el patrón**. Mitigation: el chip flotante en `editing` compensa con creces; la curva de aprendizaje del long-press se mantiene.
- **El refactor de SCSS toca 5 archivos en LR_render. Si algún test feature tenía snapshot HTML, va a quebrarse**. Mitigation: revisar `tests/feature/**/*.spec.ts` durante el `tasks.md`; actualizar selectores que assertaban contra hex en computed styles (probablemente cero — los tests assertean comportamiento, no estilo).
- **El bundle gana Press Start 2P + Material Symbols + posiblemente Hanken Grotesk si no estaba**. Material Symbols pesa ~150 KB (font file). Mitigation: cargar solo el set Outlined con `display=swap` y `font-display: optional` para no bloquear el primer paint. Si el peso se vuelve crítico, considerar `font-display: swap` con fallback nativo.
- **Cambio de comportamiento (eliminar toast) toca un spec archivado**. Es deliberado y limitado. Mitigation: el delta de `exam-marking` documenta el motivo y el reemplazo. El archive report registra el evento.

## Migration Plan

- **Deploy:** el restyle es client-only; un solo build + deploy del bundle estático cubre todo.
- **Rollback:** revertir el merge del PR del change deja la app en su versión Fase 2 archivada sin pérdida de data (la dataque vive en IndexedDB no depende de los tokens).
- **Verificación post-deploy:** abrir `/login`, `/home`, `/simulacro/:id` en un Android real y verificar que el theme-color de la status bar refleja el primary container. Verificar que el chip "Toca para cambiar" aparece tras long-press 500 ms. Verificar que la frase ambient rota al recargar `/home`.

## Open Questions

- ¿La frase ambient se loguea como evento de analytics futuro (qué frase vio el alumno, conversiones por frase) o queda 100% client-side puro? **Asunción:** 100% client-side puro en este change. Si se vuelve interesante, se evalúa después con un cambio dedicado.
- ¿El status bar iOS queda `default` o `black-translucent`? Pendiente de prueba en device real (si nadie tiene iPhone para testear ahora, defaultear a `default` por seguridad).
- ¿El test feature de `home.page.spec.ts` debe assertar que la frase está visible? **Asunción:** sí, un smoke test que verifica que `<blockquote>` se renderiza con uno de los strings del array.
