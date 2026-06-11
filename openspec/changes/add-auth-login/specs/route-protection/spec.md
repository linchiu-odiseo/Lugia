## ADDED Requirements

### Requirement: Las rutas protegidas exigen sesión activa

El sistema SHALL bloquear el acceso a `/home` (y a cualquier ruta marcada como protegida en el futuro) cuando no exista sesión activa, redirigiendo al usuario a `/login`. La protección SHALL implementarse mediante un `authGuard` funcional (functional guard de Angular) registrado en la definición de la ruta.

#### Scenario: Acceso no autenticado a `/home`

- **WHEN** el usuario navega a `/home` y no existe sesión activa
- **THEN** la navegación es redirigida a `/login`
- **AND** el componente de `/home` no se instancia

#### Scenario: Acceso autenticado a `/home`

- **WHEN** el usuario navega a `/home` y existe sesión activa válida
- **THEN** el componente de `/home` se renderiza

### Requirement: Las rutas públicas son accesibles sin sesión

La ruta `/login` SHALL ser accesible independientemente del estado de sesión, EXCEPTO que un usuario ya autenticado SHALL ser redirigido a `/home` para evitar el patrón de "login doble".

#### Scenario: Acceso no autenticado a `/login`

- **WHEN** el usuario navega a `/login` sin sesión activa
- **THEN** el componente de login se renderiza

#### Scenario: Acceso autenticado a `/login`

- **WHEN** el usuario navega a `/login` con sesión activa
- **THEN** la navegación es redirigida a `/home`

### Requirement: La raíz `/` redirige según el estado de sesión

La ruta `/` SHALL redirigir automáticamente: a `/home` si existe sesión activa, a `/login` en caso contrario.

#### Scenario: Raíz sin sesión

- **WHEN** el usuario navega a `/` y no existe sesión activa
- **THEN** la navegación es redirigida a `/login`

#### Scenario: Raíz con sesión

- **WHEN** el usuario navega a `/` y existe sesión activa
- **THEN** la navegación es redirigida a `/home`

### Requirement: El guard depende de la capability `auth-session`, no del storage

El `authGuard` SHALL consultar la sesión activa a través del use case `GetActiveSessionUseCase` (L2), no leyendo directamente del `SessionStorage`. Esto preserva el aislamiento de capas y permite testear el guard con un doble del use case.

#### Scenario: El guard no importa storage

- **WHEN** se inspecciona el código del `authGuard`
- **THEN** no importa directamente `SessionStorage` ni implementaciones concretas
- **AND** depende de `GetActiveSessionUseCase` por DI
