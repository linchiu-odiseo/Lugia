# exam-list Specification

## Purpose
Displays today's exam list to the student with four-state model (pending, open, submitted, closed). Supports focus refresh, 120s polling, and pull-to-refresh.

## Requirements

### Requirement: Obtener simulacros del día desde el backend

El sistema SHALL exponer `ObtenerSimulacrosDelDiaUseCase` (L2) que invoca el puerto `SimulacrosApi` (L1) y devuelve una lista de entidades `Simulacro` correspondientes al alumno autenticado, junto con el `serverTime` reportado por el backend. La operación reside en L2 y depende del puerto `SimulacrosApi`.

#### Scenario: Lista no vacía con simulacros del día

- **WHEN** el alumno está autenticado y se invoca `ObtenerSimulacrosDelDiaUseCase.execute()`
- **THEN** el resultado contiene una colección de `Simulacro` con al menos `id`, `area`, `name`, `count`, `inicio`, `fin`, `estado`
- **AND** el resultado incluye el `serverTime` del backend para anclar countdowns

#### Scenario: Lista vacía si no hay simulacros asignados hoy

- **WHEN** el alumno está autenticado y no tiene simulacros asignados para el día
- **THEN** el resultado es una colección vacía
- **AND** el `serverTime` igual se reporta

#### Scenario: Error de red durante la consulta

- **WHEN** se invoca el use case y `SimulacrosApi` reporta error de transporte
- **THEN** el use case rechaza la promesa con `NetworkError`

#### Scenario: Sesión expirada durante la consulta

- **WHEN** `SimulacrosApi` devuelve 401
- **THEN** el use case rechaza la promesa con `SessionExpiredError`
- **AND** la lógica de logout silencioso de Fase 1 procede

### Requirement: Modelo de 4 estados del simulacro

La entidad `Simulacro` (L1) SHALL exponer un value-object `EstadoSimulacro` que solo admite los valores `pendiente`, `abierto`, `enviado`, `cerrado`. El estado lo deriva el backend en cada respuesta; el cliente NO lo recomputa por su cuenta.

#### Scenario: Estado pendiente cuando aún no llega la hora

- **WHEN** el backend retorna un simulacro con `estado: "pendiente"`
- **THEN** la entidad `Simulacro` lo expone como tal
- **AND** la UI lo muestra como no clickeable con mensaje "Disponible a las HH:MM"

#### Scenario: Estado abierto durante la ventana

- **WHEN** el backend retorna un simulacro con `estado: "abierto"`
- **THEN** la entidad expone `abierto`
- **AND** la UI lo muestra como clickeable con countdown server-anchored hasta `fin`

#### Scenario: Estado enviado tras envío exitoso

- **WHEN** el backend retorna un simulacro con `estado: "enviado"` y un `enviadoEn`
- **THEN** la entidad expone `enviado` con el timestamp
- **AND** la UI lo muestra como gris con check y la hora del envío

#### Scenario: Estado cerrado tras fin sin envío

- **WHEN** el backend retorna un simulacro con `estado: "cerrado"`
- **THEN** la entidad expone `cerrado`
- **AND** la UI lo muestra como gris con advertencia "No enviaste · cerrado"
- **AND** la UI no permite entrar al simulacro

#### Scenario: Estado desconocido rechazado en construcción

- **WHEN** el backend retorna un valor de estado fuera del set permitido
- **THEN** la construcción de `Simulacro` lanza `InvalidSimulacroError`

### Requirement: Refresh de la lista por focus, polling y pull-to-refresh

La pantalla `/home` (LR_render) SHALL refrescar la lista de simulacros mediante tres mecanismos: evento `visibilitychange` cuando la pestaña vuelve a estar visible, polling automático cada 120 segundos mientras la pestaña esté visible, y gesto de pull-to-refresh manual del alumno.

#### Scenario: Refresh al volver al foco

- **WHEN** la pestaña pasa de oculta a visible (`document.visibilityState === "visible"`)
- **THEN** la página dispara `ObtenerSimulacrosDelDiaUseCase.execute()` y actualiza el view-model

#### Scenario: Polling pausado mientras la pestaña no es visible

- **WHEN** la pestaña deja de ser visible
- **THEN** el polling de 120s se pausa
- **AND** se reanuda al volver a ser visible

#### Scenario: Pull-to-refresh manual

- **WHEN** el alumno arrastra hacia abajo en `/home` desde la parte superior
- **THEN** la página dispara `ObtenerSimulacrosDelDiaUseCase.execute()` inmediatamente
- **AND** muestra feedback visual mientras carga

### Requirement: Backend garantiza no-overlap de simulacros

El puerto `SimulacrosApi` (L1) SHALL asumir que la lista retornada nunca contiene dos simulacros con estado `abierto` simultáneamente para el mismo alumno. El cliente trata cualquier violación como bug de backend pero degrada con elegancia.

#### Scenario: Lista válida con un único abierto

- **WHEN** el backend retorna la lista del día
- **THEN** a lo más un simulacro tiene `estado: "abierto"` en cualquier momento

#### Scenario: Violación de no-overlap como degradación graceful

- **WHEN** el backend retorna dos simulacros con `estado: "abierto"` simultáneamente (bug)
- **THEN** la PWA registra un warning en consola con los ids involucrados
- **AND** ambos cards se renderizan como `abierto` (verde clickeable) — el cliente NO recomputa el estado de dominio per Requirement 2
- **AND** el alumno puede entrar a cualquiera sin error; el primero por orden de lista es el "activo" canónico para fines de logging
