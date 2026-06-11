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

