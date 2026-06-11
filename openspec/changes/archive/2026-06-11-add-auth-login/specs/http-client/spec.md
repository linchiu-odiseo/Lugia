## ADDED Requirements

### Requirement: Inyección automática de `X-API-Key` en todo request a API-FAKE

Todo request HTTP saliente cuya URL base coincida con `environment.apiBaseUrl` SHALL incluir el header `X-API-Key` con el valor de `environment.apiKey`, inyectado por un único interceptor en L3.

#### Scenario: Request a API-FAKE incluye X-API-Key

- **WHEN** se ejecuta un request HTTP cuya URL inicia con `environment.apiBaseUrl`
- **THEN** el header `X-API-Key` está presente con el valor de `environment.apiKey`

#### Scenario: Request a host externo no recibe X-API-Key

- **WHEN** se ejecuta un request HTTP a una URL fuera de `environment.apiBaseUrl`
- **THEN** el header `X-API-Key` no está presente

### Requirement: Inyección automática de `Authorization: Bearer` cuando hay sesión

Todo request HTTP saliente hacia API-FAKE SHALL incluir el header `Authorization: Bearer <token>` cuando existe una sesión persistida, e inyectarlo MUST ocurrir en el mismo interceptor que `X-API-Key`. Si no hay sesión activa el header `Authorization` SHALL omitirse.

#### Scenario: Request con sesión activa

- **WHEN** existe sesión persistida y se ejecuta un request a API-FAKE
- **THEN** el header `Authorization` vale `Bearer <token>` con el token de la sesión

#### Scenario: Request de login sin sesión activa

- **WHEN** no existe sesión persistida y se ejecuta `POST /auth/login`
- **THEN** el header `Authorization` está ausente
- **AND** el header `X-API-Key` sigue presente

### Requirement: `HttpAuthRepository` implementa el puerto `AuthRepository`

L3 SHALL proveer `HttpAuthRepository` que implementa `AuthRepository` (L1) usando `HttpClient` de Angular. El adapter MUST mapear DTOs HTTP a entidades de dominio y traducir errores HTTP a errores de dominio.

#### Scenario: Login traduce respuesta exitosa a `Session`

- **WHEN** `HttpAuthRepository.login({ email, password })` recibe HTTP 200 con body `{ token, user: { email } }`
- **THEN** devuelve una `Session` con `bearerToken = token`, `userEmail = user.email`, `issuedAt = now`

#### Scenario: Login traduce HTTP 401 a `InvalidCredentialsError`

- **WHEN** API-FAKE responde HTTP 401 a `POST /auth/login`
- **THEN** el adapter rechaza con `InvalidCredentialsError`

#### Scenario: Login traduce errores 5xx y errores de red a `NetworkError`

- **WHEN** API-FAKE responde HTTP 500, 502, 503, 504 o el request falla en transporte
- **THEN** el adapter rechaza con `NetworkError`

#### Scenario: Logout llama al endpoint remoto si está disponible

- **WHEN** `HttpAuthRepository.logout()` se invoca y hay sesión activa
- **THEN** se envía `POST /auth/logout` con headers de autenticación
- **AND** errores en este request NO bloquean el logout local (best effort)

### Requirement: Configuración HTTP centralizada

`HttpClient` SHALL configurarse en el bootstrap mediante `provideHttpClient(withInterceptors([authHeadersInterceptor]))`. No SHALL existir uso directo de `fetch` ni `XMLHttpRequest` en el código de aplicación.

#### Scenario: Bootstrap registra el interceptor

- **WHEN** se inspecciona la configuración de proveedores raíz
- **THEN** `authHeadersInterceptor` está registrado vía `withInterceptors`

#### Scenario: Prohibido `fetch` directo en L3

- **WHEN** se inspecciona el código de L3
- **THEN** no aparecen llamadas a `fetch(...)` ni a `new XMLHttpRequest()`
