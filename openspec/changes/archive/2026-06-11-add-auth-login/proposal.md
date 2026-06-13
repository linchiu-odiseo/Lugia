## Why

Lugia es un MVP de PWA móvil en Angular que debe consumir API-FAKE (Laravel + Sanctum + Postgres en Docker) como cartilla virtual de marcaciones para simulacros. La Fase 1 del MVP requiere un flujo de autenticación funcional verificable de punta a punta en este equipo: sin login no hay sesión, sin sesión no hay forma de habilitar la cartilla en Fase 2. Esta es además la primera línea de código del proyecto, por lo que debe establecer los cimientos arquitectónicos (hexagonal estricto L1/L2/L3/LR, Angular standalone + Signals, ESLint+Prettier, subagentes, convención de commits) que toda la base de código heredará.

## What Changes

- Bootstrap del proyecto Angular 17+ con standalone components, Signals, ESLint y Prettier preconfigurados
- Estructura de carpetas hexagonal estricta: `src/L1_domain/`, `src/L2_application/`, `src/L3_periphery/`, `src/LR_render/`
- Carpetas de soporte: `tests/unit/`, `tests/feature/`, `agents/`, `docs/`, `tools/-mcp/`
- `CLAUDE.md` raíz con referencias a `agents/architecture-rules.md`, `agents/coding-style.md`, `agents/domain-glossary.md`, `agents/api-contract.md`
- Definición de tres subagentes en `.claude/agents/`: `frontend-builder`, `hexagonal-guard`, `test-engineer`
- Configuración de variables de entorno (`.env`): `API_BASE_URL`, `API_KEY`
- Capability `auth-session`: entidad `Session` y value-object `BearerToken` en L1, puerto `AuthRepository` con `login(credentials)` y `logout()`
- Capability `auth-session`: use cases `LoginUseCase` y `LogoutUseCase` en L2
- Capability `http-client`: `HttpAuthRepository` en L3 que implementa el puerto sobre `HttpClient` de Angular
- Capability `http-client`: `AuthHeadersInterceptor` en L3 que inyecta `Authorization: Bearer <token>` y `X-API-Key: <api-key>` en todo request saliente
- Capability `session-storage`: `LocalSessionStorage` en L3 que persiste la sesión en `localStorage`
- Capability `route-protection`: `authGuard` (functional guard) en L3 que valida sesión antes de activar rutas
- Capability `auth-ui`: página `LoginPage` con form reactivo (email + password), página `HomePage` vacía protegida, redirección post-login y post-logout
- Configuración de routing: `/login` (público) y `/home` (protegido)
- Tests unitarios para `LoginUseCase` y `LogoutUseCase` (L2 con doble del puerto)
- Tests de feature para `LoginPage` (validación, submit, navegación)
- Convención de commits quirúrgicos documentada en `CLAUDE.md` y `agents/coding-style.md`

## Capabilities

### New Capabilities

- `auth-session`: Modelo de dominio y casos de uso para el ciclo de vida de la sesión del usuario — login con credenciales, logout, validez de la sesión actual. Define las reglas que cualquier adaptador debe respetar.
- `http-client`: Adaptadores HTTP hacia API-FAKE — implementación del puerto de autenticación, interceptor que inyecta los headers `Authorization` y `X-API-Key` en cada request saliente, manejo base de errores HTTP. Es el adaptador L3 al que se conectarán nuevas integraciones en Fase 2.
- `session-storage`: Persistencia local de la sesión activa (token + metadatos) — abstracción sobre el storage del navegador para sobrevivir refresh y permitir logout limpio.
- `route-protection`: Guardas funcionales de Angular Router que dependen de la capability `auth-session` para autorizar el acceso a rutas privadas.
- `auth-ui`: Páginas y componentes de presentación del flujo de autenticación (LoginPage, HomePage vacía, formulario reactivo, view-models basados en Signals) en LR_render.

### Modified Capabilities

(ninguna — primer cambio del proyecto)

## Impact

- **Código nuevo**: estructura completa del proyecto Angular (`src/`, `tests/`, `agents/`, `docs/`, `.claude/agents/`, `CLAUDE.md`, configuración de ESLint, Prettier, TypeScript, Angular).
- **Dependencias**: Angular 17+ y ecosistema (rxjs solo lo estrictamente necesario), ESLint + Prettier + plugins Angular, framework de tests (Vitest o Jest preferidos sobre Karma por velocidad — decisión en design).
- **Integración externa**: contrato con API-FAKE — endpoint `POST /auth/login` y, según se confirme, `POST /auth/logout` y/o `GET /auth/me`. Documentado en `agents/api-contract.md`.
- **Variables de entorno**: `API_BASE_URL`, `API_KEY` requeridas en build/runtime.
- **Convención de commits**: aplicada desde el primer commit del bootstrap. Cada commit es una unidad quirúrgica con mensaje detallado.
- **Verificación local**: el cambio se considera completo cuando el usuario puede levantar la PWA contra API-FAKE en Docker, autenticarse exitosamente, ser redirigido a `/home`, sobrevivir un refresh, y cerrar sesión limpiamente.
- **Fuera de scope** (para Fase 2): cartilla de marcaciones, soporte offline, IndexedDB, refresh tokens, temporizador, mostrar enunciados, marcar para revisar, i18n, manejo avanzado de errores de red, telemetría.
