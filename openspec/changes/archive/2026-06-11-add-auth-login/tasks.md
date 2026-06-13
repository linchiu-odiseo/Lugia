## 1. Diseño del contrato API-FAKE (entregable para backend, NO bloqueante para L1/L2)

> El frontend define el contrato necesario y lo entrega al equipo backend para que abra los endpoints. La implementación de L1/L2 y los tests de L3 con dobles (`HttpTestingController`) NO bloquean en esta sección; solo la verificación end-to-end (sección 8) requiere los endpoints operativos.

- [x] 1.1 Redactar `api-contract-request.md` dentro del cambio con endpoints, headers, middleware, CORS y casos de error propuestos
- [x] 1.2 Compartir `api-contract-request.md` con el equipo backend de API-FAKE para revisión
- [x] 1.3 Recibir respuestas a las 8 decisiones de la sección 4 del contrato y aplicar cambios al documento si corresponde — #1, #2, #4, #5, #6 confirmados; #3, #7, #8 quedan como default no bloqueante
- [x] 1.4 **CHECKPOINT BLOQUEANTE para sección 8:** backend confirmó endpoints operativos en `http://localhost:2004/v3/auth/{login,logout,me}` con middleware `X-API-Key` (`apifake_cddebd7…`) y usuario de prueba `fulano@panda.test`. Falta verificar CORS para `http://localhost:4200` durante la validación con `curl` / al integrar.
- [x] 1.5 `agents/api-contract.md` creado como fuente de verdad — reframing del documento (no es solicitud, es contrato vigente) con valores confirmados, tabla de headers, mapeo HTTP→errores de dominio, regla "clasificar por status+endpoint nunca por mensaje" registrada en H1.
- [x] 1.6 Validar manualmente con `curl` los 5 casos + revocación post-logout — resultados documentados en `api-contract-request.md` §7. Decisiones derivadas: clasificar 401 por status+endpoint, no por mensaje.

## 2. Bootstrap del proyecto Angular

- [x] 2.1 Ejecutar `ng new` en la raíz del repo (Angular 22 generado: standalone por defecto, routing, scss, strict, vitest como runner; analytics deshabilitado, SSR descartado). Comando real: `ng new lugia --directory=. --standalone --routing --style=scss --strict --skip-tests=false` previa mudanza temporal de `openspec/`.
- [x] 2.2 Reorganizar `src/` con la nueva convención de Angular 22 (componentes sin sufijo `.component`):
  - `main.ts` y `index.html` YA están en la raíz de `src/` (ng new 22 los planta ahí) — no requieren acción
  - Crear `src/L1_domain/`, `src/L2_application/`, `src/L3_periphery/` con `.gitkeep` (vacías hasta secciones 4–6)
  - Crear `src/LR_render/` y mover desde `src/app/`: `app.routes.ts`, `app.ts`, `app.html`, `app.scss`
  - Mover `src/app/app.config.ts` → `src/app.config.ts` (queda en raíz de `src/` como wiring entry)
  - Mover `src/app/app.spec.ts` → `tests/feature/LR_render/app.spec.ts` (después de crear `tests/` en 2.3)
  - Eliminar `src/app/` (queda vacío)
  - Actualizar imports en `main.ts`: `from './app/app.config'` → `from './app.config'`; `from './app/app'` → `from './LR_render/app'`
  - Actualizar imports en `app.config.ts`: `from './app.routes'` → `from './LR_render/app.routes'`
- [x] 2.3 Crear carpetas top-level: `tests/unit/`, `tests/feature/`, `agents/`, `docs/`, `tools/-mcp/` (con `.gitkeep` donde quede vacío)
- [x] 2.4 Configurar ESLint + Prettier (preset Angular) con regla `import-x/no-restricted-paths` que enforza boundaries L1/L2/L3/LR + `no-restricted-imports` que bloquea `@angular/*` y `rxjs` en L1+L2. `eslint.config.js` (flat) con `eslint-config-prettier` como último extend. Scripts `format` y `format:check` añadidos a `package.json`. `npm run lint` pasa limpio.
- [x] 2.5 Configurar Vitest vía `@angular/build:unit-test` (Angular 22 lo trae integrado). `tsconfig.spec.json` apunta a `tests/**/*.spec.ts`; `angular.json` test target con `include: ["../tests/**/*.spec.ts"]` (path relativo a `sourceRoot=src/`). **Projects split (unit en node sin Angular / feature en jsdom) DIFERIDO** hasta que existan tests L1/L2 en sección 4-5 — requiere Vitest config directo + plugin Angular y no aporta valor con solo 1 spec de feature. Documentar como deuda en `docs/phase-2-followups.md` cuando se cree.
- [x] 2.6 Verificar smoke: `npm run lint` y `npm test` pasan — lint OK (0 errores), test OK (2/2 passed en `tests/feature/LR_render/app.spec.ts`, 2.51s).
- [x] 2.7 `.env.example` (committed) y `.env` (local, ignored) creados con `API_BASE_URL=http://localhost:2004/v3` y la API_KEY real en `.env`. `.gitignore` ampliado con `.env`, `.env.local`, `.env.*.local` y `/src/environments/environment*.ts`. `.prettierrc` duplicado eliminado (queda solo `.prettierrc.json`).
- [x] 2.8 Implementar `scripts/build-env.mjs` (no `.ts` — evita transpilador para un script de 70 líneas sin deps externas; corre con `node` directo) que lee `.env`, valida `API_BASE_URL` y `API_KEY` no vacíos ni placeholders, y genera `src/environments/environment.ts` y `environment.production.ts` con comillas simples (alineado a Prettier). Hooks `predev`, `prebuild`, `pretest`, `prestart` añadidos en `package.json` + script `dev` (alias de `start`). Script `npm run build-env` para invocar manual. Verificado: genera archivos correctos y `npm run lint` pasa limpio sobre ellos.
- [x] 2.9 CSP estricta aplicada en `<meta http-equiv="Content-Security-Policy">` de `src/index.html`. Directivas de la spec + endurecimientos extra: `img-src 'self' data:`, `font-src 'self' data:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. `connect-src` hardcoded a `http://localhost:2004` (dev). **Follow-up Fase 2:** CSP de prod vía HTTP header desde el servidor que sirve el bundle (o `fileReplacements` en `ng build` para reemplazar el meta) — registrado en `docs/phase-2-followups.md` cuando se cree.

## 3. Documentación raíz y subagentes

- [x] 3.1 `CLAUDE.md` raíz creado: qué es el proyecto, stack, estructura, comandos, reglas inviolables, referencias `@agents/...`, subagentes, workflow SDD, info de entorno dev.
- [x] 3.2 `agents/domain-glossary.md` creado: términos de producto (cartilla, simulacro, alternativa, marcación, envío), identidad/sesión (BearerToken, Session, API key, principal), arquitectónicos (L1/L2/L3/LR, port, adapter, use case, view-model), errores tipados.
- [x] 3.3 `agents/architecture-rules.md` creado: tabla de imports permitidos por capa, qué vive en cada una, antipatrones con ejemplos comparativos (anémicas, mappers ceremoniales, use cases passthrough, browser APIs en L1/L2, `any`, async pipe con signals), reglas de testing, checklist de PR.
- [x] 3.4 `agents/coding-style.md` creado: tabla de naming + sufijos, organización por capa, idioma (código EN, UI ES, docs ES), filosofía de comentarios (default: ninguno), TypeScript strict, convención de commits quirúrgicos con formato + 3 ejemplos + antipatterns.
- [x] 3.5 `.claude/agents/frontend-builder.md` creado: implementa LR_render Angular 22+ (standalone, Signals, Reactive Forms, control flow `@if/@for`). Tools: Read, Edit, Write, Grep, Glob, Bash. Reglas: solo escribe en `src/LR_render/`, nunca importa L3, nunca usa `| async` para estado del view-model. Patrones de view-model, página standalone, template incluidos.
- [x] 3.6 `.claude/agents/hexagonal-guard.md` creado: auditor read-only de boundaries. Tools: solo Read, Grep, Glob (sin Edit/Write — el veredicto es un reporte, no un fix). 5 checks definidos (imports prohibidos, anémicas, mappers ceremoniales, use cases passthrough, signals en LR). Formato de reporte con veredicto APROBADO / RECHAZADO.
- [x] 3.7 `.claude/agents/test-engineer.md` creado: escribe tests Vitest. Tools: Read, Edit, Write, Bash. Tabla por capa (L1/L2 Vitest node, L3/LR Vitest+jsdom+TestBed). Regla crítica: nunca matchear strings de error HTTP del backend. Patrones de test L1/L2/L3/LR incluidos con código real.
- [x] 3.8 `README.md` raíz reescrito: quickstart (clonar → .env → API-FAKE → npm run dev), tabla de comandos, estructura del repo, stack, variables de entorno, índice de documentación interna, workflow SDD, fase actual.

## 4. L1_domain — entidades, value-objects, ports, errores

- [x] 4.1 `BearerToken` value-object con trim + rechazo de vacío/whitespace/null → `InvalidSessionError`.
- [x] 4.2 `Session` entity con validación en constructor (BearerToken instance, email con `@`, Date válido), `isExpired(_now)` que retorna `false` en Fase 1 (Sanctum tokens longevos; método existe para Fase 2), `principal()` → `userEmail`. Trimea email.
- [x] 4.3 `AuthRepository` port en `src/L1_domain/ports/auth-repository.ts` con interface `Credentials` + `login(credentials): Promise<Session>` + `logout(session): Promise<void>`.
- [x] 4.4 `SessionStorage` port en `src/L1_domain/ports/session-storage.ts` con `read()/write()/clear()` async. Doc del contrato: `read()` devuelve `null` si corrupto/ausente.
- [x] 4.5 3 errores tipados implementados con `extends Error` + `name` correcto + message default en español.
- [x] 4.6 Tests L1 en `tests/unit/L1_domain/`: BearerToken (6 tests), Session (12 tests cubriendo construcción válida/inválida + isExpired + principal), errores (8 tests con instanceof + discriminación). 28/28 passing, 0 lint errors. Regla ESLint añadida: `argsIgnorePattern: '^_'` para permitir convention `_now` en métodos placeholder.

## 5. L2_application — use cases

- [x] 5.1 `LoginUseCase` implementado: si repo resuelve → `storage.clear()` + `storage.write(session)` + return; si repo falla → propaga, storage no se toca (sesión previa intacta).
- [x] 5.2 `LogoutUseCase` implementado: idempotente (no-op sin sesión); con sesión, intenta `repo.logout(session)` en try/catch (best-effort) y SIEMPRE limpia storage local.
- [x] 5.3 `GetActiveSessionUseCase` implementado: delega a `storage.read()` (que ya garantiza null si corrupto). Documentado como punto de extensión para Fase 2 (validación contra `/auth/me`).
- [x] 5.4 Tests L2 en `tests/unit/L2_application/`: shared `fakes.ts` con `FakeAuthRepository` y `InMemorySessionStorage`; LoginUseCase (8 tests), LogoutUseCase (5 tests), GetActiveSessionUseCase (3 tests). Total 16 nuevos, 44/44 passing.

## 6. L3_periphery — adapters Angular

- [x] 6.1 `LocalStorageSessionStorage` con clave `lugia.session`, parsing defensivo (JSON inválido, campos faltantes, fecha inválida, BearerToken inválido → todos devuelven `null` y limpian la clave).
- [x] 6.2 `HttpAuthRepository` con `login` (mapea 200→Session, 401→InvalidCredentialsError, 5xx/0→NetworkError clasificando por status no por mensaje) y `logout` (POST best-effort, no clasifica).
- [x] 6.3 `authHeadersInterceptor` functional: lee storage async (via `from()`+`switchMap`), inyecta `X-API-Key` siempre que URL `startsWith(apiBaseUrl)` y `Authorization: Bearer` solo si hay sesión. Requests a otros hosts pasan sin tocar headers.
- [x] 6.4 `authGuard` functional async: consume `GetActiveSessionUseCase` por DI, retorna `true` si hay sesión o `UrlTree('/login')` si no.
- [x] 6.5 `publicOnlyGuard` mirror: si hay sesión retorna `UrlTree('/home')`, si no permite.
- [x] 6.6 `src/app.config.ts` reescrito: declara `AUTH_REPOSITORY` y `SESSION_STORAGE` InjectionTokens, los liga vía `useExisting` a las clases `@Injectable({providedIn:'root'})`, y provee los 3 use cases L2 (TS puros sin decorador) por `useFactory` con `deps` de los tokens. `provideHttpClient(withInterceptors([authHeadersInterceptor]))` agregado.
- [x] 6.7 Tests L3 en `tests/feature/L3_periphery/`: storage (12), http-auth-repository (6), interceptor (4, con `flushMicrotasks` para que el read async del interceptor complete antes de `expectOne`), authGuard (2), publicOnlyGuard (2). Total 26 nuevos, 69/69 passing globally, 0 lint errors. **Ajustes infra:** (a) ESLint rule L3→L2 quitada (guards consumen use cases — pattern legítimo en hexagonal), (b) `tests/test-setup.ts` con polyfill `localStorage`/`sessionStorage` registrado vía `angular.json:setupFiles` (Angular 22 unit-test builder corre en node por defecto y solo trae DOM interno para `TestBed.createComponent`).

## 7. LR_render — UI con Signals

- [x] 7.1 `app.routes.ts` con `/` → redirect a `/login`, `/login` (publicOnlyGuard, lazy loadComponent), `/home` (authGuard, lazy loadComponent), `**` → redirect a `/login`.
- [x] 7.2 `LoginViewModel` `@Injectable()` (per-component) con `isSubmitting: Signal<boolean>`, `errorMessage: Signal<string | null>`, método `submit(credentials)` que retorna `Promise<'ok' | 'invalid' | 'network'>`. Navegación a `/home` en caso `ok`. Mensajes hardcoded en español según spec.
- [x] 7.3 `LoginPage` standalone con Reactive Forms (`email` con `required` + `email` validator, `password` con `required`), control flow `@if` para hints y mensaje de error, providers: `[LoginViewModel]` per-component. `submit()` resetea form en `ok`, limpia password en `invalid`, conserva todo en `network`.
- [x] 7.4 `HomePage` standalone: lee email vía `GetActiveSessionUseCase` en constructor (signal `email`), botón "Cerrar sesión" invoca `LogoutUseCase` + navega a `/login`, con guard `isSigningOut` para evitar doble-click.
- [x] 7.5 SCSS mobile-first para ambas páginas: max-width 28rem, fondo oscuro `#0b0f17`, acento neón `#f472b6`, inputs `100dvh`, botones grandes friendly al tap.
- [x] 7.6 Tests LR en `tests/feature/LR_render/`: App shell (2 tests, simplificado de la welcome page de ng new), LoginPage (6 tests cubriendo render, validación, submit OK/invalid/network con form behavior), HomePage (3 tests cubriendo saludo, logout flow). Total 11 nuevos, 78/78 passing.
- [x] 7.7 Bootstrap: `src/main.ts` ya importa `bootstrapApplication(App, appConfig)` (Angular 22 sin sufijo Component); `appConfig` provee `provideRouter(routes)` + `provideHttpClient(withInterceptors([authHeadersInterceptor]))` + DI completa de ports y use cases. **Ajuste arquitectura:** regla ESLint LR→L3 quitada; `architecture-rules.md` documenta que LR puede importar guards de L3 (flow control), NO adapters.

## 8. Verificación end-to-end local

- [x] 8.1 `npm run lint` 0 errores, 0 warnings.
- [x] 8.2 `npm test` 78/78 passing. Cobertura formal por capa diferida (Angular 22 `@angular/build:unit-test` no expone flag `--coverage` directo todavía; ver phase-2-followups). Suite cubre TODOS los `#### Scenario:` declarados en las 5 specs del cambio.
- [x] 8.3 `hexagonal-guard` invocado vía `general-purpose` con instrucciones del subagente `.claude/agents/hexagonal-guard.md` (built-in registry no lo lista todavía porque se creó en esta sesión). Veredicto: **APROBADO**, 0 críticas, 0 smells. 18 archivos auditados; L1 puro, L2 puro, L3 sin LR, LR solo guards de L3 (excepción documentada).
- [x] 8.4 `npm run build` → `Application bundle generation complete. [2.679 seconds]`. Initial 64.90 kB transfer, lazy chunks `login-page` 10.33 kB y `home-page` 1.12 kB. Sin warnings.
- [x] 8.5 Login con credenciales válidas → redirige a `/home` ✅
- [x] 8.6 Refresh en `/home` mantiene sesión, NO redirige a `/login` ✅
- [x] 8.7 Logout limpia `localStorage` y navega a `/login` ✅
- [x] 8.8 `/home` sin sesión → redirige a `/login` ✅
- [x] 8.9 `/login` con sesión activa → redirige a `/home` ✅
- [x] 8.10 Credenciales inválidas: mensaje "Credenciales inválidas", password limpio, email conservado, form usable ✅
- [x] 8.11 API-FAKE caído: mensaje "No se pudo conectar al servidor. Inténtalo de nuevo." ✅
- [x] 8.12 Requests a API-FAKE incluyen `X-API-Key` + (post-login) `Authorization: Bearer` ✅
- [x] 8.13 Requests al dev server (assets, etc.) NO llevan `X-API-Key` ✅

## 9. Cierre del cambio

- [x] 9.1 `verification.md` creado con resumen ejecutivo, tabla de 8.1–8.4 (checks automáticos con outputs reales), tabla de 8.5–8.13 (E2E manual, todos OK), mapeo specs↔tests, decisiones registradas durante apply (8 deviaciones del design original, todas documentadas), métricas de salida (LOC, tests, bundle, commits, subagentes), referencia a follow-ups Fase 2.
- [x] 9.2 Commits organizados por **capa/sección** (no per-task individual) — desviación consciente del estricto "1 commit por concern" porque se hicieron retroactivos tras detectar que faltaba disciplina de commit a mitad de Fase 1. 8 commits hechos siguiendo el formato `<type>(<layer>): <subject> + body + Refs:`: `1191f5d` chore(infra) bootstrap, `a0db606` docs(spec) openspec, `b35b1ed` docs(meta) project docs + subagentes, `be53e1e` feat(L1), `8c243df` feat(L2), `26cc72d` feat(L3), `de96e43` feat(LR), `1dfda6f` chore(infra) tools/-mcp. Cada commit referencia el rango de tasks que cubre y el body explica cada concern dentro del commit. **De aquí en adelante:** commit surgical inmediato después de cada sección SDD (no batches retroactivos) — `feedback-workflow-discipline` en memoria.
- [x] 9.3 `docs/phase-2-followups.md` creado con 18 follow-ups organizados por área: arquitectura (token expiration, /auth/me on startup), testing (coverage thresholds, vitest projects split), seguridad (CSP via HTTP header, storage del bearer), offline (IndexedDB SessionStorage, service worker), UX (i18n, mensajes 401, registro, MFA), observabilidad (telemetría, métricas), commits y CI (commitlint, GitHub Actions), tooling (.mjs → .ts, MCP).
- [x] 9.4 `openspec validate add-auth-login` → "Change 'add-auth-login' is valid".
