## Context

Lugia es una PWA Angular 22+ instalada en celulares de alumnos preuniversitarios. El `provideServiceWorker` está registrado desde Fase 1 (`src/app.config.ts:77-80`) con `enabled: !isDevMode()` y `registerWhenStable:30000`. El `ngsw-config.json` cachea el shell con `installMode: prefetch`.

**Problema operativo concreto:** un cliente reportó que su PWA está en versión vieja y la única vía para que reciba el fix es desinstalar y reinstalar. Esto pasa porque ningún código de la app escucha `SwUpdate.versionUpdates` ni llama a `activateUpdate()`. El SW de Angular descarga la versión nueva en background pero la espera que el usuario "cierre todos los tabs" — comportamiento que en mobile no se da: la PWA queda en el switcher de apps indefinidamente.

**Restricciones que no se mueven:**
- Arquitectura hexagonal estricta L1/L2/L3/LR (ESLint enforza, `hexagonal-guard` audita).
- L1 + L2 son TypeScript puro (cero `@angular/*`, cero `rxjs`, cero browser APIs).
- Strings UI en es-PE hardcoded.
- Tenant slug parametrizado (no afecta a este change pero condiciona dónde van envs).
- Patrón `.env` → `scripts/build-env.mjs` → `src/environments/` ya consolidado para `API_BASE_URL` y `TENANT_SLUG`.

**Contexto del dominio crítico:** el alumno en `/simulacro/:id` está rindiendo un examen con auto-envío programado vía `setTimeout` en memoria (`programar-auto-envio.use-case.ts:57`). Un `location.reload()` durante el simulacro cancela ese timer y degrada UX (pierde scroll, pierde pregunta visible). IndexedDB sobrevive — marcaciones y cola de envíos persisten — pero la interrupción es visible y ansiógena. Aplicar updates mid-simulacro es la pesadilla que este change debe evitar.

**Stakeholders:**
- Alumno (usuario final supervisado en aula). Necesita: la app no se rompe mid-cartilla, el reinicio no le borra respuestas.
- Equipo de producto / dev. Necesita: poder publicar fixes y que lleguen al celu sin desinstalar.
- Soporte. Necesita: un número de versión visible para diagnóstico ("¿qué versión tenés?").

## Goals / Non-Goals

**Goals:**
- Que un cliente con la PWA ya instalada reciba un build nuevo dentro de minutos de abrir la app, sin desinstalar.
- Que el alumno NUNCA reciba un reload sorpresivo durante un simulacro en curso.
- Que el alumno tenga garantía explícita ("tus marcaciones están guardadas") al confirmar el update.
- Que soporte pueda preguntar al alumno qué versión tiene y verla en pantalla.
- Que el ciclo de release sea operable manualmente (sin CI/CD) bumpeando `.env`.
- Que la falla de `activateUpdate()` no rompa la app (graceful fallback: banner persistente, reintenta al siguiente checkForUpdate).

**Non-Goals:**
- Crear `/profile` o `/historial` (otro change de IA navegacional).
- Tab bar inferior (no existe nav lateral/inferior en la app, se mantiene lineal).
- Script automático de bump (`npm run release:patch`) — manual por ahora.
- E2E con Playwright del SW real (no hay test infra E2E).
- Push notifications nativas anunciando updates (overkill).
- Cambios al qué se cachea en `ngsw-config.json`.
- Sincronización en tiempo real entre múltiples instancias del mismo alumno en distintos devices (cada device negocia su propio update).
- Bypass del SW para hot-reload en producción (no aplica; el patrón de versión vs hash ya lo resuelve).

## Decisions

### D1 — `PwaUpdateService` vive en L3_periphery como servicio Angular, no es port de dominio

**Decisión:** crear `src/L3_periphery/pwa/pwa-update.service.ts` como servicio Angular `@Injectable({ providedIn: 'root' })` que inyecta `SwUpdate` y `Router` de Angular. NO hay puerto L1 ni use case L2 para esto.

**Por qué:**
- El servicio es 100% infra de browser/Angular (SwUpdate, Router, document.location.reload, document.visibilityState). No tiene lógica de negocio del dominio Lugia.
- Inventar un puerto L1 sería ceremonia vacía — un mapper passthrough que `hexagonal-guard` flaggearía como antipatrón.
- Precedente en el repo: `src/L3_periphery/envio/envio-retry-dispatcher.service.ts` y `src/L3_periphery/clock/server-anchored-clock.ts` también son servicios L3 que se inicializan con `provideAppInitializer` y no tienen contrato en L1.
- Si en el futuro queremos testear lógica de gating fuera de Angular (improbable), podemos extraer una función pura helper, pero el shell del servicio queda en L3.

**Alternativa descartada (A):** definir puerto `UpdateNotifier` en L1, use case `CheckForUpdateUseCase` en L2, adapter `SwUpdateAdapter` en L3. Rechazada — viola la regla del proyecto "no use cases passthrough"; la lógica relevante es exclusivamente browser.

**Alternativa descartada (B):** poner el servicio directamente en `LR_render` como parte de un componente. Rechazada — el servicio necesita arrancar con `provideAppInitializer` (suscribir `versionUpdates` apenas la app monta), y eso debe ser DI raíz, no view-model.

### D2 — Gating C por ruta: postergar el banner mientras la ruta sea `/simulacro/:id`

**Decisión:** el `PwaUpdateService` mantiene dos estados internos: `updateAvailable` (versión nueva descargada, lista para activar) y `bannerVisible` (signal `pendingUpdate().available`). La regla: `bannerVisible = updateAvailable && !router.url.startsWith('/simulacro/')`. Cuando el alumno navega fuera de `/simulacro/:id`, el servicio re-evalúa.

**Por qué:**
- Es la única opción del espectro UX (de las tres exploradas: auto, prompt-siempre, gating) que respeta el riesgo crítico del dominio (auto-envío en `setTimeout` cancelado por reload mid-simulacro) sin abandonar al cliente colgado.
- El alumno aplica updates SOLO en `/home`, donde no hay timers de auto-envío en memoria. Cuando vuelve a entrar a un simulacro, el view-model re-programa el `setTimeout` al montarse (comportamiento existente, sin cambios).
- Implementación: suscribirse a `router.events.pipe(filter(e => e instanceof NavigationEnd))` y reevaluar.
- Edge case: si el alumno está en `/home`, ve el banner, lo ignora, y entra a un simulacro, el banner desaparece (correcto — durante el simulacro no debe distraerlo). Si vuelve a `/home` sin enviar, el banner vuelve.

**Alternativa descartada (A):** auto-reload sin pensar. Rechazada — riesgo mid-simulacro.

**Alternativa descartada (B):** prompt-siempre sin gating. Rechazada — confunde al alumno que ve el banner en medio de la cartilla y no sabe si actualizar o no.

**Alternativa descartada (C):** gating por estado del simulacro (no por ruta). Rechazada — más complejo, requiere consultar IDB para saber si hay marcaciones en progreso. La regla por ruta es declarativa y suficiente.

### D3 — `APP_VERSION` en `.env` (manual), propagado por `scripts/build-env.mjs`

**Decisión:** nueva variable `APP_VERSION` en `.env` (ej. `APP_VERSION=1.0.0`). El script `scripts/build-env.mjs` la lee, la inyecta en `src/environments/environment.ts` como `appVersion: string`, y además modifica el `ngsw.json` post-build inyectando `{ appData: { version } }`. Si falta en `.env`, el script falla con error claro en preflight (mismo patrón de `API_BASE_URL`).

**Por qué:**
- Sigue el patrón ya consolidado del proyecto (`API_BASE_URL`, `TENANT_SLUG` viven en `.env` y se propagan vía el mismo script). Cero curva de aprendizaje nueva.
- Separa explícitamente lo que dispara el banner (hash del bundle, controlado por Angular) de lo que se muestra al usuario (string SemVer, controlado por humano). Esto se documenta en `.env.example` para evitar la trampa "cambié el .env pero no redepleyé".
- Manual es aceptable hoy porque no hay CI/CD. Cuando se arme el pipeline, un script `release:patch` puede automatizar el bump (futuro change).

**Alternativa descartada (A):** leer `package.json#version` vía import. Rechazada — Angular standalone con `provideEnvironmentInitializer` no soporta cleanly imports de JSON; tendría que hardcodear vía `import.meta.env` o similar, rompe el patrón uniforme `.env`.

**Alternativa descartada (B):** usar el hash del SW (`currentVersion.hash`) como número de versión visible. Rechazada — UX terrible (`a3f2b9c...`). El hash queda para diagnóstico interno, no para el alumno.

**Alternativa descartada (C):** generar `APP_VERSION` automáticamente desde git (`git describe --tags`). Rechazada — agrega dependencia de git en el build, y los desarrolladores que clonan sin tags fallarían en preflight.

### D4 — Inyectar `appData: { version }` en `ngsw.json` post-build para exponer SemVer al SwUpdate

**Decisión:** `scripts/build-env.mjs` ejecuta un step adicional post-`ng build` que abre `dist/.../ngsw.json` y mete `appData: { version: APP_VERSION }` en el JSON. El `PwaUpdateService` lee `event.currentVersion.appData.version` y `event.latestVersion.appData.version` en los eventos `VERSION_READY`.

**Por qué:**
- Es la forma documentada de Angular SW para adjuntar metadata arbitraria a una versión, accesible vía `VersionEvent.appData`.
- Sin esto, el modal de confirmación NO podría mostrar "Versión actual: X → Versión nueva: Y" — solo tendría hashes.
- El step es trivial (`JSON.parse` + mutar + `JSON.stringify`), no rompe la pipeline.

**Riesgo abierto:** la forma "oficial" de Angular para `appData` es declararla en `ngsw-config.json` y dejar que `@angular/build` la propague. El step post-build es un workaround porque `ngsw-config.json` no soporta lectura de envs en tiempo de build. Mitigación: si Angular cambia el shape de `ngsw.json` en una versión mayor, el script falla en build local; lo atrapamos antes de deploy. Documentar el workaround como "tech debt aceptado" en `agents/architecture-rules.md`.

**Alternativa descartada (A):** hardcodear `appData` en `ngsw-config.json`. Rechazada — habría que editar dos archivos en cada release (`.env` + `ngsw-config.json`), y el segundo termina olvidado.

**Alternativa descartada (B):** no exponer versiones; mostrar mensaje genérico "Hay una versión nueva" en banner y modal. Rechazada parcialmente — el banner SÍ es genérico (por elegancia y resistencia a olvidos de bump), pero el modal muestra los números porque ahí el alumno está prestando atención y los números dan confianza.

### D5 — Polling adicional en `visibilitychange`, gated por `navigator.onLine`

**Decisión:** además del `registerWhenStable:30000` ya configurado en `provideServiceWorker`, el `PwaUpdateService` se suscribe a `document.addEventListener('visibilitychange', ...)`. Cuando `document.visibilityState === 'visible'` Y `navigator.onLine === true`, dispara `swUpdate.checkForUpdate()`. El throttle interno asegura no más de un check por 60 s, para evitar spam si el alumno alterna apps rápido.

**Por qué:**
- El alumno en mobile abre/cierra la PWA frecuentemente. Cada vuelta a foreground es una oportunidad barata de chequear update.
- Sin `visibilitychange`, el `registerWhenStable:30000` solo dispara la PRIMERA vez después de cargar la app. Para sesiones largas (cliente abre la PWA, la deja minimizada, vuelve 30 min después) no detecta nada.
- Gating por `navigator.onLine` evita intentos que sabemos van a fallar.

**Alternativa descartada:** polling con `setInterval` cada N minutos. Rechazada — gasta batería incluso con app en background. `visibilitychange` es event-driven y solo gasta cuando hay actividad.

### D6 — Copy del modal afirma garantía ("Tus marcaciones están guardadas"), prohíbe lenguaje de borrado

**Decisión:** el copy del modal de confirmación es exactamente:
> "La app se va a reiniciar para aplicar la nueva versión. Tus marcaciones están guardadas."

PROHIBIDO en cualquier copy de esta capability:
- "Se borrarán..."
- "Vas a perder..."
- "Se eliminarán datos..."
- Cualquier verbo de pérdida.

**Por qué:**
- Técnicamente, `activateUpdate()` + `location.reload()` NO toca IndexedDB. Lo único que se reemplaza es el shell (HTML/JS/CSS del bundle). Marcaciones y cola de envíos persisten.
- El alumno preuniversitario está ansioso durante un día de simulacros. Un mensaje "se borrarán" lo lleva a no actualizar nunca por miedo, perpetuando el bug que este change resuelve.
- La afirmación explícita ("están guardadas") es necesaria — no alcanza con omitir; hay que decir que SÍ están a salvo.
- Tests automatizados deben verificar el copy literal del modal para que un refactor accidental no introduzca lenguaje de borrado.

### D7 — Estilo visual del banner: variante info azul tenue, no compite con cards de simulacros

**Decisión:** nueva variante CSS `banner--update` en el stylesheet del HomePage. Bg pastel basado en el azul del botón primario (`Enviar`) saturado al 12-15%, texto en el azul saturado al 70%, ícono `system_update` de Material Symbols. Sin borde fuerte; opcional un borde sutil 1px del mismo azul al 25%.

**Por qué:**
- El alumno en `/home` revisa rápido qué simulacros tiene. El banner debe ser visible pero NO competir con las cards de "Disponible" (verde) ni con los banners de error (rojo) ni con los de info bloqueante.
- El azul lo asocia visualmente con "acción positiva" (el alumno ya conoce el botón Enviar). Es consistente.
- Posición entre el header (saludo) y la lista de simulacros — mismo slot que los banners `banner--blocking` actuales.

**Alternativa descartada (amarillo tipo warning):** el usuario lo descartó explícitamente. Amarillo daría ansiedad innecesaria.

### D8 — Componente `<app-version-footer>` reutilizable, visible siempre en LoginPage y HomePage

**Decisión:** componente standalone Angular en `src/LR_render/components/version-footer/`. Renderiza un `<footer>` con texto "Lugia · versión {{ env.appVersion }}", estilo gris claro (`--color-text-muted` ya definido o equivalente), font-size 11px, sin negrita, centrado. Se embebe en `home.page.html` y `login.page.html` como último child del `<main>`.

**Por qué:**
- Soporte pide al alumno "¿qué versión tenés?" — debe ser legible sin abrir DevTools.
- Estilo discreto (tenue, chico) cumple el pedido del usuario: "que no se vea mucho, para que no quede feo".
- Componente reutilizable evita duplicación de markup y de estilos entre las dos páginas.
- Se queda invisible cuando `env.appVersion` está vacío (defensa contra config rota).

## Risks / Trade-offs

[Riesgo R1] `appData` en `ngsw.json` no es contrato estable de Angular. Si Angular cambia el shape en una versión mayor, el inyector custom de `build-env.mjs` se rompe. **Mitigación:** test unit del script de inyección + fallback en `PwaUpdateService`: si `event.currentVersion.appData?.version` es `undefined`, mostrar "—" en el modal y NO bloquear el botón Actualizar. Documentar como tech debt.

[Riesgo R2] Mid-simulacro, el `setTimeout` del auto-envío vive en memoria. Si por error el banner se aplicara en `/simulacro/:id` (bug en el gating), el timer se cancela. **Mitigación:** D2 prohíbe explícitamente; tests verifican que el banner queda `available: false` mientras `router.url.startsWith('/simulacro/')`. Adicional: el view-model re-programa al montarse el componente, cubriendo el caso "alumno entra a un simulacro después del update".

[Riesgo R3] Cliente que olvida bumpear `APP_VERSION` y solo despleya código: el banner aparece (hashes cambian) pero el modal dice "1.0.0 → 1.0.0", percibido como bug por el alumno. **Mitigación:** documentar en `.env.example` con comentario explícito; banner usa copy genérico ("Hay una versión nueva") sin números para que el peor caso quede contenido al modal; comentario en `agents/coding-style.md` como recordatorio de release.

[Riesgo R4] El alumno aplica el update sin red. `activateUpdate()` sí puede ejecutarse offline (el bundle ya fue prefetched), pero `location.reload()` carga el shell desde cache (OK). Sin embargo, llamadas iniciales a `/auth/me` y `/student/exam-sessions` van a fallar. **Mitigación:** El alumno ya tolera esto hoy (la app maneja errores de red en boot). El reload no introduce un escenario nuevo. Documentar como "comportamiento existente, no regresión".

[Riesgo R5] `visibilitychange` puede dispararse muchas veces seguidas si el usuario alterna apps. Sin throttle, `checkForUpdate()` se llama varias veces/seg. **Mitigación:** throttle de 60 s en el servicio (último timestamp, comparar antes de llamar).

[Riesgo R6] Tests en jsdom no instancian Service Workers reales. El comportamiento real del SW solo se verifica en device manual. **Mitigación:** unit del `PwaUpdateService` con `SwUpdate` mockeado cubre la lógica (gating, polling throttle, fallback `appData` undefined). Verificación manual end-to-end documentada como "manual QA checklist" en el archive-report del change.

[Trade-off T1] Manual bump del `.env` es propenso a olvido. Alternativa (CI/CD con git tag) está fuera de scope hoy. **Aceptamos:** la fricción manual es preferible al complicar el pipeline ahora. El banner genérico mitiga el peor caso del olvido.

[Trade-off T2] Postergar el banner mid-simulacro significa que un cliente que pasa todo el día en `/simulacro/:id` (improbable pero posible si encadena 4-5 simulacros sin volver a `/home`) no recibe el update. **Aceptamos:** el caso es teórico; la app fuerza navegación a `/home` después de enviar cada simulacro.

## Migration Plan

**Setup local (developer):**
1. Agregar `APP_VERSION=1.0.0` al `.env` local (sino, `npm run dev` falla en preflight con mensaje claro).
2. Verificar `.env.example` actualizado y commit.

**Deploy a producción (primer release con la feature):**
1. Bumpear `APP_VERSION` a `1.1.0` en `.env` de prod (release semver: MINOR porque agrega feature visible).
2. `npm run build` — genera bundle con nuevo hash + `ngsw.json` con `appData.version: "1.1.0"`.
3. Subir `dist/` al server estático.
4. Cliente que tenga la PWA instalada (pre-update):
   - Abre la app → SW intenta `checkForUpdate` a los 30s o en visibilitychange.
   - Detecta hashes nuevos, descarga bundle 1.1.0 en background.
   - `VERSION_READY` emite con `currentVersion` = legacy (sin `appData`, fallback "—") y `latestVersion` = 1.1.0.
   - Si está en `/home`, banner aparece. Modal muestra "— → 1.1.0".
   - Alumno actualiza → reload → ahora tiene 1.1.0.
5. Cliente que instala fresh post-deploy: ve 1.1.0 directo en el footer, sin banner.

**Deploy de release siguiente (ej. 1.1.1):**
1. Bumpear `.env` a `APP_VERSION=1.1.1`.
2. `npm run build` → subir.
3. Cliente con 1.1.0 ve banner; modal muestra "1.1.0 → 1.1.1".

**Rollback:**
- Si el deploy de 1.1.0 introduce un bug crítico:
  - Bumpear `APP_VERSION=1.1.1` (NUNCA volver al número anterior — el SW puede caché-busterar mal con versiones bajas) y rebuildear desde un git revert.
  - O publicar 1.0.1 (patch del baseline). Cliente con 1.1.0 detectará el deploy (hashes nuevos), modal mostrará "1.1.0 → 1.0.1". Aceptable.

**Comunicación:**
- README de release: cómo bumpear y desplegar.
- `agents/coding-style.md`: nota sobre bump obligatorio en cada deploy.

## Open Questions

- **OQ1:** ¿`HomePage` del tutor (`/tutor/home`) debe mostrar el banner también? Inicialmente NO (tutor es stub Fase 3). Cuando el tutor tenga UI real, decidir si embeber `<app-update-banner>` ahí. Documentar como follow-up.
- **OQ2:** ¿Throttle de `visibilitychange` debe ser configurable o constante 60 s? Por ahora constante; configurable si surge necesidad en producción.
- **OQ3:** ¿El modal debería mostrar también changelog ("Qué hay de nuevo")? Fuera de scope hoy — requiere infra de mantener changelog versionado. Si se pide, sería un campo `appData.changelog` en `ngsw.json`.
- **OQ4:** ¿Loguear los eventos de update a un endpoint de telemetría (`POST /v3/telemetry/update`)? Fuera de scope — no hay endpoint de telemetría hoy.
