# Follow-ups conocidos para Fase 2

> Estado al cierre de Fase 1 (`add-auth-login`, 2026-06-11). Decisiones que se difirieron por scope o por inmadurez del tooling. Se revisita al arrancar Fase 2 (cartilla de marcaciones).

## Arquitectura y dominio

### Política de expiración del Sanctum token

- **Fase 1:** `Session.isExpired(_now)` retorna `false` siempre. Asumimos que el token Sanctum es longevo hasta logout explícito (confirmado contra API-FAKE en dev, sin política configurada server-side).
- **Fase 2:** revisar con backend si introducen TTL real. Si sí, implementar la lógica en `Session.isExpired` y considerar mecanismo de refresh (probablemente NO refresh tokens — Sanctum no los usa nativo —, sino re-login silencioso o expiración hard que fuerza login).

### Validación de sesión al arrancar la PWA

- **Fase 1:** `GetActiveSessionUseCase` delega directo al storage (con comentario marcando el punto de extensión).
- **Fase 2:** agregar llamada ligera a `GET /auth/me` al startup para detectar tokens revocados server-side. Implementación esperada: nuevo método en `GetActiveSessionUseCase` o un caso de uso adicional `ValidateActiveSessionUseCase` que orquesta storage + repo + clear si 401.

## Testing

### Cobertura formal con thresholds

- **Fase 1:** `npm test` corre 78 tests cubriendo todos los `#### Scenario:` de las 5 specs. NO se mide cobertura por línea con thresholds duros porque el builder `@angular/build:unit-test` en Angular 22 todavía no expone una flag `--coverage` estable; configurar via `vitest.config.ts` standalone fuera del builder Angular es bleeding-edge.
- **Fase 2:** evaluar:
  - Esperar a que el builder de Angular añada soporte oficial (`ng test --code-coverage`).
  - O hacer split Vitest "projects": `unit` standalone para L1/L2 con coverage v8/istanbul nativo, `feature` via builder para LR/L3.
  - Targets a hacer cumplir: L1 ≥ 90%, L2 ≥ 80%, LR ≥ 60% (definidos en `agents/architecture-rules.md`).

### Vitest projects mode (unit en node sin Angular, feature en jsdom con TestBed)

- **Fase 1:** una sola pipeline Vitest via builder Angular; entorno node por defecto con polyfill `localStorage`/`sessionStorage` en `tests/test-setup.ts`.
- **Fase 2:** cuando L2 crezca (use cases de cartilla con lógica compleja), conviene aislar L1+L2 en una pipeline node pura sin overhead Angular. Implementación: `vitest.config.ts` con `projects: [unit, feature]`, mover el target `test` de `angular.json` a usar Vitest directo (no via builder).

## Seguridad y producción

### CSP en producción

- **Fase 1:** CSP estricta en `<meta http-equiv>` con `connect-src 'self' http://localhost:2004` hardcoded para dev.
- **Fase 2:** mover CSP a un **HTTP header** desde el servidor que sirve el bundle (típicamente edge / CDN / Nginx). El meta CSP del index.html debería:
  - O eliminarse al hacer build prod (vía `fileReplacements` en `angular.json`).
  - O regenerarse al hacer build prod (extender `scripts/build-env.mjs` para reescribir el `<meta>` con `${API_BASE_URL}` de prod).
- Razón: `connect-src` cambia por entorno y un meta estático no escala.

### Almacenamiento del bearer

- **Fase 1:** `localStorage` con CSP estricta como mitigación XSS (design D4).
- **Fase 2:** evaluar migrar a:
  - Web Crypto + sessionStorage (sobrevive refresh pero no cierre de tab).
  - O memoria + reauth silencioso al startup (si Fase 2 introduce un endpoint de auto-login con cookie httpOnly desde backend).
- Disparador para evaluar: cuando la PWA salga del entorno interno y se exponga externamente.

## Offline-first y service worker

### IndexedDB para sesión

- **Fase 1:** `LocalStorageSessionStorage` único.
- **Fase 2:** segunda implementación del puerto `SessionStorage`: `IndexedDbSessionStorage` (capacidad mayor, transaccional) o un híbrido (write-through localStorage + IndexedDB). El puerto NO cambia, solo se reemplaza el `useExisting` en `app.config.ts`. Es exactamente el caso que justifica la arquitectura hexagonal estricta desde día 1.

### Service worker / PWA instalable + tunnel HTTPS para celular

- **Fase 1:** no es PWA instalable, no hay service worker. Es una SPA con manifest + theme-color + meta tags PWA (look-and-feel app, sin install).
- **Fase 2:** triple paso:
  1. `ng add @angular/pwa` para añadir service worker, manifest definitivo, íconos. Estrategia de caché conservadora (network-first para `/v3/*`, cache-first para assets). Compatibilizar con la CSP estricta del index.html.
  2. **Tunnel HTTPS con `cloudflared`** (decisión confirmada con el usuario 2026-06-11, NO ngrok) para exponer `localhost:4200` a la red pública con TLS válido — requisito del browser para permitir "Add to Home Screen". Cloudflared es gratis, no requiere cuenta para túneles efímeros, y respeta el contrato HTTPS sin advertencias de certificado. Comando esperado: `cloudflared tunnel --url http://localhost:4200`. La URL pública resultante hay que agregarla temporalmente al `connect-src` de la CSP o al manifest scope.
  3. Asegurar CORS en API-FAKE para el nuevo origin público del tunnel (o tunelizar también el backend con `cloudflared tunnel --url http://localhost:2004` y apuntar `API_BASE_URL` al tunnel del backend).
- Verificación E2E mobile: instalar la PWA en Android Chrome → ver ícono NeonPanda en home → abrir → fullscreen sin barra de browser → login funciona contra API-FAKE tunelizada.

## UX y producto

### i18n

- **Fase 1:** strings hardcoded en es-PE.
- **Fase 2:** evaluar `$localize` o `ngx-translate` cuando el catálogo de strings supere ~50 y/o haya pedido de soporte multi-locale. Centro de gravedad: error messages, mensajes de cartilla, validaciones de form.

### Mensajes de error 401 detallados

- **Fase 1:** todos los 401 fuera de login se mapean a "Sesión expirada, inicia sesión nuevamente." (regla `agents/api-contract.md`).
- **Fase 2:** considerar logging/telemetría server-side para distinguir api-key inválida vs bearer revocado (útil para soporte, no para el usuario).

### Recuperación de contraseña y registro

- **Fase 1:** fuera de scope. Único usuario `fulano@panda.test` en API-FAKE.
- **Fase 2:** depende de si la academia adopta autoservicio o si admin crea usuarios. Endpoints adicionales en API-FAKE: `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`.

### MFA

- **Fase 1:** no hay.
- **Fase 2:** evaluar TOTP si los simulacros tienen valor comercial alto (premium content). Sanctum permite implementarlo en backend; el frontend agrega un paso intermedio en `LoginUseCase`.

## Observabilidad

### Telemetría

- **Fase 1:** no hay logging estructurado ni captura de errores en producción. `console.error` solamente.
- **Fase 2:** evaluar Sentry, LogRocket o un endpoint propio. Capturar:
  - Errores no esperados en `LoginViewModel.submit` (`else throw` reachable).
  - Latencia de `/auth/login` para detectar degradación del backend.
  - Sesiones rejected en arranque (token invalidado server-side).

### Métricas de bundle

- **Fase 1:** budgets en `angular.json` (initial 500 kB warning / 1 MB error). Actual: 233 kB raw / 64.90 kB transfer — holgado.
- **Fase 2:** revisar cuando la cartilla añada features. Considerar `source-map-explorer` para análisis si supera 100 kB transfer.

## Commits y CI

### Hook de validación commit-msg

- **Fase 1:** convención de commits documentada en `agents/coding-style.md` pero no enforzada.
- **Fase 2:** evaluar Husky + commitlint con la regex `^(feat|fix|refactor|docs|test|chore|build)\((L1|L2|L3|LR|infra|docs)\): .{1,72}$`. Disparador: si el equipo crece o aparecen commits que rompen la convención.

### CI pipeline

- **Fase 1:** sin CI (proyecto local en una sola máquina).
- **Fase 2:** GitHub Actions con jobs `lint`, `test`, `build`, `audit` (hexagonal-guard). Branch protection en `main`.

## Tooling

### Migrar `scripts/build-env.mjs` a TypeScript

- **Fase 1:** `.mjs` para evitar añadir transpilador a un script de 70 líneas.
- **Fase 2:** cuando Node ≥ 22 con `--experimental-strip-types` se vuelva default-stable, migrar a `.ts`. Beneficio: types compartidos con `src/environments/`.

### MCP servers en `tools/-mcp/`

- **Fase 1:** carpeta vacía, sin MCP servers.
- **Fase 2:** evaluar si conviene un MCP server local para queries de API-FAKE en desarrollo (ej: "muéstrame el último login del usuario X"). Solo si el equipo lo usa frecuente.
