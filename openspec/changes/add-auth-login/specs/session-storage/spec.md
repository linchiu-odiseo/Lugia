## ADDED Requirements

### Requirement: Persistencia de la sesión activa entre recargas

El sistema SHALL persistir la sesión activa en almacenamiento del navegador de modo que un refresh de página NO obligue al usuario a re-autenticarse.

#### Scenario: La sesión sobrevive a un refresh

- **WHEN** el usuario inicia sesión exitosamente
- **AND** el usuario recarga la página
- **THEN** la sesión sigue activa sin volver a ingresar credenciales
- **AND** el usuario permanece en la última ruta protegida visitada (o es enviado a `/home` si la ruta no se puede restaurar)

#### Scenario: Logout limpia la sesión persistida

- **WHEN** el usuario invoca logout
- **THEN** la sesión persistida se elimina del almacenamiento
- **AND** un refresh posterior redirige a `/login`

### Requirement: Almacenamiento aislado tras un puerto del dominio

El mecanismo de persistencia SHALL exponerse como un puerto `SessionStorage` definido en L1. Implementaciones concretas (p. ej. `LocalStorageSessionStorage`) viven en L3. Ningún módulo en L1, L2 o LR SHALL referenciar `localStorage`, `sessionStorage`, `window`, ni APIs equivalentes del navegador.

#### Scenario: L1 y L2 no referencian APIs de browser

- **WHEN** se inspecciona el código de `L1_domain/` y `L2_application/`
- **THEN** no aparecen los identificadores `localStorage`, `sessionStorage`, `window`, `document` ni `navigator`

#### Scenario: LR consume `SessionStorage` solo vía DI

- **WHEN** se inspecciona el código de `LR_render/`
- **THEN** cualquier acceso a sesión se hace inyectando el puerto `SessionStorage` o use cases que lo orquestan

### Requirement: Integridad del dato persistido

El `SessionStorage` SHALL serializar la `Session` como JSON bajo una clave única (`neonpanda.session`). Al leer, si el JSON no se puede parsear o no representa una `Session` válida, la entrada SHALL descartarse y la operación de lectura SHALL devolver `null`.

#### Scenario: Lectura exitosa

- **WHEN** se ha guardado una sesión válida y se invoca `sessionStorage.read()`
- **THEN** devuelve la `Session` equivalente

#### Scenario: JSON corrupto

- **WHEN** la clave `neonpanda.session` contiene texto no parseable como JSON
- **THEN** `sessionStorage.read()` devuelve `null`
- **AND** la clave se elimina

#### Scenario: JSON parseable pero con campos faltantes

- **WHEN** la clave contiene JSON válido sin `bearerToken` o sin `userEmail`
- **THEN** `sessionStorage.read()` devuelve `null`
- **AND** la clave se elimina

### Requirement: Clave de almacenamiento estable y namespaced

La clave usada en el storage SHALL ser exactamente `neonpanda.session`. Cambiarla SHALL considerarse un breaking change y requerir migración explícita.

#### Scenario: Clave única para evitar colisiones

- **WHEN** se inspecciona la implementación de `LocalStorageSessionStorage`
- **THEN** usa la constante `STORAGE_KEY = 'neonpanda.session'` sin variantes ni prefijos dinámicos
