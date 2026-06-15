# http-client — Delta Spec (fase-3-login-learnex)

## REMOVED Requirements

### Requirement ELIMINADO: Inyección automática de `X-API-Key`

`auth-headers.interceptor.ts` se elimina. Ya no se inyecta el header `X-API-Key` en ninguna request.

### Requirement ELIMINADO: Inyección automática de `Authorization: Bearer`

El header `Authorization: Bearer <token>` ya no existe. El back learnex usa cookies HttpOnly — el browser las envía automáticamente con `withCredentials: true`.

### Requirement ELIMINADO: `HttpAuthRepository.login()` → `Session`

`HttpAuthRepository.login()` ya no devuelve `Session`. Reemplazado por → `Identity`.

### Requirement ELIMINADO: Lectura de `X-New-Bearer` en responses

El rolling refresh vía header `X-New-Bearer` se elimina. La renovación pasa a ser reactiva por 401.

### Requirement ELIMINADO: `authHeadersInterceptor` en el bootstrap

`withInterceptors([authHeadersInterceptor])` se reemplaza por `withInterceptors([credentialsInterceptor])`.

---

## ADDED Requirements

### Requirement: `credentials.interceptor.ts` — `withCredentials: true` global

Todo request HTTP saliente cuya URL base coincida con `environment.apiBaseUrl` SHALL ser clonado con `{ withCredentials: true }` por `credentials.interceptor.ts`. Esto permite que el browser envíe automáticamente las cookies HttpOnly de learnex.

#### Scenario: Request a `apiBaseUrl` lleva `withCredentials: true`

- **WHEN** se ejecuta cualquier request HTTP cuya URL inicia con `environment.apiBaseUrl`
- **THEN** el request clonado tiene `withCredentials: true`

#### Scenario: Request a host externo no recibe `withCredentials`

- **WHEN** se ejecuta un request HTTP a una URL fuera de `environment.apiBaseUrl`
- **THEN** `withCredentials` no se altera en ese request

### Requirement: Refresh reactivo en 401 — lock `shareReplay(1)`

Cuando cualquier request protegido recibe HTTP 401, `credentials.interceptor.ts` SHALL:

1. Invocar `ensureRefreshed()` — una operación con lock `shareReplay(1)` que garantiza que como máximo 1 llamada a `POST /t/{slug}/auth/refresh` esté en vuelo simultáneamente.
2. Si el refresh es exitoso (nuevas cookies seteadas) → reintentar la request original UNA vez.
3. Si el refresh falla con `RefreshFailedError` → propagar `RefreshFailedError` sin reintentar.
4. El lock SHALL resetearse con `finalize` al completar el refresh (exitoso o fallido) para que el siguiente ciclo de 401 pueda disparar un nuevo refresh.

#### Scenario: Request a `/student/me` con 401 → refresh → retry exitoso

- **WHEN** `GET /t/{slug}/student/me` devuelve HTTP 401
- **THEN** el interceptor invoca `POST /t/{slug}/auth/refresh`
- **AND** si el refresh devuelve 200, reintenta `GET /t/{slug}/student/me`
- **AND** el caller recibe la respuesta del retry como si no hubiera habido 401

#### Scenario: Race — 3 requests paralelos con 401 → solo 1 refresh

- **WHEN** 3 requests distintos reciben HTTP 401 simultáneamente
- **THEN** solo 1 llamada a `POST /t/{slug}/auth/refresh` es ejecutada
- **AND** los 3 reintentos esperan al mismo refresh observable
- **AND** los 3 reintentan después de que el refresh completa

#### Scenario: Refresh con token inválido → `RefreshFailedError` propagado

- **WHEN** el refresh devuelve HTTP 401 con `code: TENANT_AUTH_REFRESH_TOKEN_INVALID`
- **THEN** el interceptor propaga `RefreshFailedError`
- **AND** la request original NO es reintentada

### Requirement: Skip refresh para URLs `/auth/`

Si la URL de la request original contiene `/auth/` (ej. `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`), el interceptor SHALL NO intentar un refresh cuando recibe 401 en esa request — en su lugar propaga el error directamente.

#### Scenario: 401 en `/auth/refresh` — no se re-intenta refrescar

- **WHEN** `POST /t/{slug}/auth/refresh` devuelve HTTP 401
- **THEN** el interceptor NO invoca `/auth/refresh` de nuevo
- **AND** emite `RefreshFailedError`

#### Scenario: 401 en `/auth/login` — no se intenta refresh

- **WHEN** `POST /t/{slug}/auth/login` devuelve HTTP 401
- **THEN** el interceptor NO invoca `/auth/refresh`
- **AND** el error es clasificado como `InvalidCredentialsError` y propagado

### Requirement: Clasificación de errores HTTP por `(status, endpoint, code)` — prohibido leer `message`

El adapter SHALL clasificar errores HTTP usando exclusivamente `(status, endpoint, code)` donde `code` es el campo estructurado del response body (ej. `TENANT_AUTH_INVALID_CREDENTIALS`). El campo `message` del body es volátil, i18n del back, y SHALL ser ignorado para clasificación.

| Status | Endpoint | `code` en body | Error de dominio |
|---|---|---|---|
| 401 | `/auth/login` | `TENANT_AUTH_INVALID_CREDENTIALS` | `InvalidCredentialsError` |
| 401 | `/auth/refresh` | `TENANT_AUTH_REFRESH_TOKEN_INVALID` | `RefreshFailedError` |
| 401 | `/auth/refresh` | `TENANT_AUTH_REFRESH_TOKEN_MISSING` | `RefreshFailedError` |
| 401 | cualquier endpoint protegido (no `/auth/`) | cualquiera | manejo por interceptor (refresh + retry) |
| 429 | `/auth/login` | cualquiera | `RateLimitError` |
| 403 | `/{role}/me` | cualquiera | `ProfileNotAvailableError` |
| 404 | `/{role}/me` | cualquiera | `ProfileNotAvailableError` |
| 403 | otros endpoints | cualquiera | `ForbiddenError` |
| 404 | otros endpoints | cualquiera | `NotFoundError` |
| 5xx | cualquiera | — | `NetworkError` |
| error de transporte | — | — | `NetworkError` |

#### Scenario: 401 en login con `code: TENANT_AUTH_INVALID_CREDENTIALS` → `InvalidCredentialsError`

- **WHEN** `POST /t/{slug}/auth/login` devuelve HTTP 401 con body `{ code: "TENANT_AUTH_INVALID_CREDENTIALS" }`
- **THEN** `HttpAuthRepository.login()` rechaza con `InvalidCredentialsError`

#### Scenario: 429 en login → `RateLimitError`

- **WHEN** `POST /t/{slug}/auth/login` devuelve HTTP 429
- **THEN** `HttpAuthRepository.login()` rechaza con `RateLimitError`

#### Scenario: `message` del body NUNCA se lee para clasificación

- **WHEN** se inspecciona `HttpAuthRepository` y el interceptor
- **THEN** no aparecen comparaciones de `error.error?.message` ni de strings humanos en la lógica de clasificación
- **AND** la clasificación usa exclusivamente `status`, la URL/endpoint, y `error.error?.code`

#### Scenario: `code` extraído del body para distinguir errores 401

- **WHEN** `POST /t/{slug}/auth/refresh` devuelve HTTP 401 con body `{ code: "TENANT_AUTH_REFRESH_TOKEN_MISSING" }`
- **THEN** el error es clasificado como `RefreshFailedError`

### Requirement: Path builder — todas las URLs usan `environment.tenantSlug`

L3 SHALL construir todas las URLs a learnex como `/t/${environment.tenantSlug}/<recurso>`. Ningún literal `"vonex"` (ni ningún otro slug concreto) SHALL aparecer en código fuente bajo `src/`. El slug proviene de `environment.tenantSlug`, generado por `scripts/build-env.mjs` desde la env var `TENANT_SLUG`.

#### Scenario: Path builder usa `environment.tenantSlug`

- **WHEN** se inspecciona cualquier adapter de L3 que construye URLs a learnex
- **THEN** el path se forma con `environment.tenantSlug`, no con un literal como `"vonex"`

#### Scenario: Cambio de `TENANT_SLUG` en env var → todas las URLs lo reflejan

- **WHEN** `TENANT_SLUG=acme` está en `.env` y se invoca `npm run build-env`
- **THEN** `environment.tenantSlug === "acme"`
- **AND** todas las requests apuntan a `/t/acme/...`

#### Scenario: Prohibido el literal del slug en `src/`

- **WHEN** se ejecuta `grep -r "vonex" src/`
- **THEN** el comando devuelve cero matches

### Requirement: Bootstrap registra `credentialsInterceptor`

`HttpClient` SHALL configurarse en el bootstrap mediante `provideHttpClient(withInterceptors([credentialsInterceptor]))`. `authHeadersInterceptor` no SHALL aparecer en la configuración.

#### Scenario: Bootstrap registra el interceptor correcto

- **WHEN** se inspecciona la configuración de proveedores raíz (`app.config.ts`)
- **THEN** `credentialsInterceptor` está registrado vía `withInterceptors`
- **AND** `authHeadersInterceptor` NO está registrado

#### Scenario: Prohibido `fetch` directo en L3

- **WHEN** se inspecciona el código de `L3_periphery/`
- **THEN** no aparecen llamadas a `fetch(...)` ni a `new XMLHttpRequest()`

### Requirement: `HttpAuthRepository` implementa el puerto `AuthRepository` evolucionado

`HttpAuthRepository` en L3 SHALL implementar los métodos `login()`, `me()`, `refresh()`, `logout()`, `getProfile(role)` según el nuevo contrato. Todos mapean DTOs HTTP a value-objects de dominio y traducen errores HTTP a errores de dominio según la tabla de clasificación.

#### Scenario: `login()` traduce response exitosa a `Identity`

- **WHEN** `POST /t/{slug}/auth/login` responde HTTP 200 con body `{ user: { id, email, codigo, roles, permissions, tenantId }, expiresAt }`
- **THEN** `HttpAuthRepository.login()` devuelve `Identity` con todos los campos poblados

#### Scenario: `me()` traduce response a `Identity`

- **WHEN** `GET /t/{slug}/auth/me` responde HTTP 200 con el mismo shape que login
- **THEN** `HttpAuthRepository.me()` devuelve `Identity`

#### Scenario: `logout()` es best-effort — fallo no bloquea

- **WHEN** `POST /t/{slug}/auth/logout` falla con error de red
- **THEN** `HttpAuthRepository.logout()` resuelve sin propagar el error (o propaga `NetworkError` que el use case ignora)
