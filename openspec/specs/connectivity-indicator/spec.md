# connectivity-indicator Specification

## Purpose
Real-time online/offline status indicator for the exam marking UI. Lets the user know if their markings can be submitted or are queued.

## Requirements

### Requirement: Puerto `Connectivity` en L1

La capa L1 SHALL definir el puerto `Connectivity` con una operación reactiva que expone el estado online/offline como un valor observable o signal-like. El puerto es puro y no depende de `navigator` ni de tipos de Angular.

#### Scenario: Estado inicial reflejando online

- **WHEN** se construye el adapter con red disponible
- **THEN** la lectura inicial del puerto reporta `isOnline: true`

#### Scenario: Estado inicial reflejando offline

- **WHEN** se construye el adapter sin red
- **THEN** la lectura inicial reporta `isOnline: false`

#### Scenario: Transición online → offline

- **WHEN** el adapter detecta pérdida de red
- **THEN** la observación del puerto emite `false`
- **AND** los suscriptores reciben el cambio

#### Scenario: Transición offline → online

- **WHEN** el adapter detecta retorno de red
- **THEN** la observación del puerto emite `true`

### Requirement: Adapter `BrowserConnectivity` en L3

La capa L3 SHALL implementar `BrowserConnectivity` que cumple el puerto `Connectivity` leyendo `navigator.onLine` para el estado inicial y suscribiéndose a los eventos `online` y `offline` del `window` para las transiciones. Internamente mantiene un `Set<listener>` simple — la integración con Signals de Angular ocurre en LR_render (el componente badge construye su propio Signal a partir de la suscripción al puerto).

#### Scenario: Lectura inicial usa navigator.onLine

- **WHEN** el adapter se construye
- **THEN** consulta `navigator.onLine` para reportar el estado inicial

#### Scenario: Suscripción a eventos del browser

- **WHEN** el browser dispara el evento `offline`
- **THEN** los listeners suscritos al puerto son notificados con `false`

#### Scenario: Idempotencia ante eventos duplicados

- **WHEN** el browser dispara el evento `online` dos veces seguidas estando ya online
- **THEN** los listeners NO son notificados otra vez
- **AND** no se propaga un cambio espurio

### Requirement: Badge de conectividad en el shell de la UI

La UI (LR_render) SHALL mostrar un badge visible en la esquina superior derecha del shell, persistente mientras el alumno esté autenticado. Verde cuando `isOnline === true`, rojo cuando `false`. Sin estado intermedio amarillo.

#### Scenario: Badge verde mientras hay red

- **WHEN** el alumno está autenticado y la red está disponible
- **THEN** el badge se renderiza en verde con el texto "En línea" o ícono equivalente

#### Scenario: Badge rojo cuando no hay red

- **WHEN** la conexión cae
- **THEN** el badge se renderiza en rojo con el texto "Sin conexión" o ícono equivalente
- **AND** el cambio es inmediato sin recargar la pantalla

#### Scenario: Badge solo visible logueado

- **WHEN** el alumno está en `/login`
- **THEN** el badge no se renderiza

### Requirement: La señal de conectividad es consumida por el dominio para retry

El estado `isOnline` SHALL ser legible por los use cases que despachan envíos pendientes para programar retries automáticos. La integración pasa por el puerto, NO por suscripciones directas a `navigator` desde L2.

#### Scenario: Use case dispara retry al volver online

- **WHEN** existen envíos pendientes en la cola y `Connectivity` emite `true`
- **THEN** `RetomarEnviosPendientesUseCase.execute()` se invoca automáticamente
