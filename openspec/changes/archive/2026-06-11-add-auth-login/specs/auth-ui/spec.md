## ADDED Requirements

### Requirement: Página de login con formulario reactivo de email y password

`LoginPage` (LR_render) SHALL exponer un formulario reactivo (`ReactiveFormsModule`) con dos campos: `email` (validado como formato de email) y `password` (mínimo 1 carácter), más un botón submit. El estado del formulario SHALL conectarse a un `LoginViewModel` que expone Signals.

#### Scenario: Validación de email vacío

- **WHEN** el usuario deja el campo `email` vacío
- **THEN** el botón submit está deshabilitado
- **AND** se muestra un mensaje de validación bajo el campo

#### Scenario: Validación de formato de email

- **WHEN** el usuario ingresa un valor en `email` que no cumple formato `<algo>@<dominio>`
- **THEN** se muestra un mensaje "Email inválido" bajo el campo
- **AND** el botón submit está deshabilitado

#### Scenario: Validación de password vacío

- **WHEN** el usuario deja el campo `password` vacío
- **THEN** el botón submit está deshabilitado

### Requirement: Login exitoso redirige a `/home` y limpia el formulario

Cuando `LoginUseCase` resuelve exitosamente, `LoginPage` SHALL navegar a `/home` y limpiar el contenido del formulario para evitar exponer credenciales en memoria del componente.

#### Scenario: Submit de credenciales válidas

- **WHEN** el usuario envía credenciales válidas y `LoginUseCase` resuelve
- **THEN** el navegador se mueve a `/home`
- **AND** los campos `email` y `password` del formulario están vacíos
- **AND** el indicador `isSubmitting` del view-model vuelve a `false`

### Requirement: Login fallido muestra error legible y mantiene el formulario usable

Cuando `LoginUseCase` rechaza, `LoginPage` SHALL mostrar un mensaje de error legible bajo el formulario y SHALL dejar el formulario editable para reintentar. El password SHALL limpiarse para forzar al usuario a re-tipearlo; el email SHALL conservarse.

#### Scenario: Credenciales inválidas

- **WHEN** el backend reporta credenciales inválidas (`InvalidCredentialsError`)
- **THEN** se muestra el mensaje "Credenciales inválidas" bajo el formulario
- **AND** el campo `password` se limpia
- **AND** el campo `email` conserva su valor
- **AND** el botón submit vuelve a habilitarse

#### Scenario: Error de red

- **WHEN** el backend no responde o devuelve 5xx (`NetworkError`)
- **THEN** se muestra el mensaje "No se pudo conectar al servidor. Inténtalo de nuevo."
- **AND** los campos del formulario conservan sus valores
- **AND** el botón submit vuelve a habilitarse

### Requirement: `HomePage` es un shell protegido con acción de logout

`HomePage` (LR_render) SHALL renderizar un placeholder mínimo (texto identificador + botón "Cerrar sesión") tras el `authGuard`. Es la pantalla destino del login en Fase 1.

#### Scenario: Render como usuario autenticado

- **WHEN** un usuario autenticado navega a `/home`
- **THEN** se renderiza el shell con saludo (p. ej. "Hola, <email>") y botón "Cerrar sesión"

#### Scenario: Logout desde `HomePage`

- **WHEN** el usuario presiona el botón "Cerrar sesión"
- **THEN** `LogoutUseCase` se invoca
- **AND** el navegador se mueve a `/login`
- **AND** un refresh posterior sigue en `/login` (sesión efectivamente eliminada)

### Requirement: Los view-models exponen estado vía Signals

Los view-models de `LoginPage` y `HomePage` SHALL exponer su estado reactivo exclusivamente como Angular Signals. Los templates SHALL leer signals directamente; no SHALL usarse `async pipe` para estado del view-model. Conversiones desde RxJS (p. ej. `valueChanges` de Reactive Forms) SHALL usar `toSignal()`.

#### Scenario: `LoginViewModel` expone Signals

- **WHEN** se inspecciona `LoginViewModel`
- **THEN** expone al menos `isSubmitting: Signal<boolean>`, `errorMessage: Signal<string | null>`
- **AND** sus campos derivados (p. ej. `canSubmit`) están implementados con `computed()`

#### Scenario: Template lee signals como funciones

- **WHEN** se inspecciona la plantilla de `LoginPage`
- **THEN** las expresiones del template invocan los signals como `viewModel.isSubmitting()` (o equivalentes con `@if`)
- **AND** no aparece `| async` para estado del view-model

### Requirement: Mensajes de UI en español (es-PE) hardcoded en Fase 1

Todos los mensajes visibles al usuario en Fase 1 SHALL estar en español (es-PE) directamente en las plantillas. Se acepta como deuda técnica documentada; la i18n entrará en una fase posterior.

#### Scenario: Mensajes en español

- **WHEN** se inspeccionan los templates de `LoginPage` y `HomePage`
- **THEN** todos los textos visibles están en español
- **AND** no se usan claves de i18n ni `$localize` en Fase 1
