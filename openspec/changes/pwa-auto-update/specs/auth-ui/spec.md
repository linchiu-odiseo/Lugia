# auth-ui — Delta Spec (pwa-auto-update)

## ADDED Requirements

### Requirement: `LoginPage` muestra footer de versión `<app-version-footer>`

`LoginPage` SHALL embeber el componente reutilizable `<app-version-footer>` (definido en la capability `pwa-shell-update`) como último child del contenedor principal de la página. El footer SHALL ser visible siempre, sin condicional de estado de auth. El componente leerá `environment.appVersion` y renderizará `"Lugia · versión {{ env.appVersion }}"` con estilo tenue (gris claro, ~11px, sin negrita, centrado).

Razón: consistencia visual con `HomePage` (también muestra el footer) y necesidad operativa — el alumno preuniversitario puede tener problemas de login y reportar al soporte qué versión tiene SIN haber iniciado sesión.

#### Scenario: Footer presente en login fresco

- **GIVEN** la app fue cargada con `environment.appVersion === '1.1.0'`
- **AND** el usuario no está autenticado y ve `LoginPage`
- **WHEN** se renderiza la página
- **THEN** el DOM SHALL contener `<app-version-footer>` con texto `"Lugia · versión 1.1.0"`

#### Scenario: Footer presente en login con error

- **GIVEN** el usuario intentó login y vio un error de credenciales
- **WHEN** se re-renderiza `LoginPage` con `errorMessage` poblado
- **THEN** `<app-version-footer>` SHALL seguir visible con el mismo contenido

#### Scenario: Footer no compite visualmente con el formulario

- **WHEN** se renderiza `LoginPage`
- **THEN** `<app-version-footer>` SHALL renderizarse debajo del botón "Iniciar sesión"
- **AND** el estilo `font-size` SHALL ser ~11px y color tenue (no compite con el botón primario)
