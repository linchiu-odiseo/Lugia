# auth-session Specification

## Purpose
TBD - created by archiving change add-auth-login. Update Purpose after archive.
## Requirements
### Requirement: Autenticación con credenciales

El sistema SHALL aceptar credenciales (email y password) y, si son válidas, devolver una `Session` activa que contiene un `BearerToken` y la identidad del usuario. Esta operación reside en `LoginUseCase` (L2) y depende del puerto `AuthRepository` (L1).

#### Scenario: Login exitoso

- **WHEN** se invoca `LoginUseCase.execute({ email, password })` con credenciales válidas
- **THEN** el resultado es una `Session` con `bearerToken` no vacío
- **AND** la `Session` queda persistida (vía `SessionStorage`) para sobrevivir refresh

#### Scenario: Credenciales inválidas

- **WHEN** se invoca `LoginUseCase.execute` y `AuthRepository` reporta credenciales rechazadas
- **THEN** el use case rechaza la promesa con `InvalidCredentialsError`
- **AND** no se persiste ninguna sesión
- **AND** cualquier sesión previa permanece intacta

#### Scenario: Error de red durante login

- **WHEN** se invoca `LoginUseCase.execute` y `AuthRepository` reporta error de transporte
- **THEN** el use case rechaza la promesa con `NetworkError`
- **AND** no se persiste ninguna sesión

### Requirement: Una sola sesión activa

El sistema SHALL mantener como máximo una sesión activa simultánea. Iniciar un nuevo login DEBE descartar cualquier sesión previa antes de persistir la nueva.

#### Scenario: Login sobreescribe sesión previa

- **WHEN** existe una sesión persistida y `LoginUseCase` se invoca con credenciales válidas distintas
- **THEN** la sesión previa se elimina antes de persistir la nueva
- **AND** consultar la sesión activa devuelve exclusivamente la nueva

### Requirement: Cierre de sesión

El sistema SHALL exponer `LogoutUseCase` (L2) que termina la sesión activa de manera idempotente.

#### Scenario: Logout con sesión activa

- **WHEN** existe una sesión persistida y se invoca `LogoutUseCase.execute()`
- **THEN** la sesión se elimina del almacenamiento
- **AND** consultar la sesión activa devuelve `null`

#### Scenario: Logout sin sesión activa

- **WHEN** no existe ninguna sesión persistida y se invoca `LogoutUseCase.execute()`
- **THEN** la operación completa sin errores (no-op)

### Requirement: Recuperación de sesión al arrancar la app

El sistema SHALL exponer una operación `GetActiveSessionUseCase` (L2) que devuelve la sesión persistida si existe y es válida, o `null` en caso contrario. Esta operación es invocada por `authGuard` y por el bootstrap de la app.

#### Scenario: Sesión persistida válida

- **WHEN** la app arranca y existe una sesión persistida
- **THEN** `GetActiveSessionUseCase.execute()` devuelve la `Session`

#### Scenario: Sesión persistida corrupta o ilegible

- **WHEN** la app arranca y el dato persistido no se puede parsear a una `Session` válida
- **THEN** la entrada corrupta se descarta del almacenamiento
- **AND** `GetActiveSessionUseCase.execute()` devuelve `null`

### Requirement: La `Session` es una entidad de dominio con comportamiento

La entidad `Session` (L1) SHALL exponer al menos: `bearerToken: BearerToken`, `userEmail: string`, `issuedAt: Date`, y los métodos `isExpired(now: Date): boolean` y `principal(): string`.

#### Scenario: Sesión recién creada no está expirada

- **WHEN** se construye una `Session` con `issuedAt` igual a `now`
- **THEN** `session.isExpired(now)` devuelve `false`

#### Scenario: BearerToken vacío rechazado en construcción

- **WHEN** se intenta construir una `Session` con `bearerToken` vacío o `null`
- **THEN** se lanza `InvalidSessionError`

### Requirement: Renovación automática del bearer vía header `X-New-Bearer`

El sistema SHALL renovar automáticamente el bearer de la sesión activa cuando el backend incluya el header `X-New-Bearer` en cualquier respuesta autenticada. El interceptor de L3 (`auth-headers.interceptor.ts`) extiende su responsabilidad: además de inyectar el bearer en requests, lee el header de la respuesta y, si presente, despacha `ActualizarBearerSiRenovadoUseCase` (L2) que persiste el nuevo bearer vía `SessionStorage`. La sesión activa se actualiza sin que el alumno perciba el cambio.

#### Scenario: Backend envía nuevo bearer en respuesta a GET /simulacros

- **WHEN** el alumno tiene una sesión activa con bearer A
- **AND** invoca `GET /v3/simulacros` con bearer A
- **AND** el backend responde 200 con header `X-New-Bearer: B`
- **THEN** el interceptor invoca `ActualizarBearerSiRenovadoUseCase.execute("B")`
- **AND** la sesión persistida actualiza su `bearerToken` a B
- **AND** los próximos requests usan bearer B

#### Scenario: Respuesta sin header de renovación no toca la sesión

- **WHEN** el backend responde sin header `X-New-Bearer`
- **THEN** la sesión persistida queda intacta
- **AND** no se invoca `ActualizarBearerSiRenovadoUseCase`

#### Scenario: Renovación en cualquier endpoint autenticado, no solo GET /simulacros

- **WHEN** el backend incluye `X-New-Bearer` en la respuesta a `POST /v3/simulacros/:id/envio` o `GET /auth/me`
- **THEN** la sesión se actualiza igualmente
- **AND** la lógica de renovación no depende del endpoint específico

#### Scenario: Renovación silenciosa — sin re-render de la UI

- **WHEN** la renovación ocurre durante un GET de fondo (polling 120s)
- **THEN** la UI no muestra ningún indicador visual
- **AND** el alumno no es interrumpido

#### Scenario: Bearer renovado vacío rechazado

- **WHEN** el backend responde con `X-New-Bearer:` (string vacío)
- **THEN** el use case ignora el header
- **AND** la sesión persistida queda intacta

#### Scenario: Bearer expirado sin renovación previa

- **WHEN** el alumno no ha hecho ningún request en más de 6h y el bearer expira
- **AND** el próximo request devuelve 401
- **THEN** procede la lógica de logout silencioso definida en Fase 1
- **AND** el alumno es redirigido a `/login`
