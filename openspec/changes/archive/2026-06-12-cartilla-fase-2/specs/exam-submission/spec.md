## ADDED Requirements

### Requirement: Envío del simulacro con `clientSubmittedAt`

El sistema SHALL exponer `EnviarSimulacroUseCase` (L2) que toma el `simulacroId`, lee las marcaciones de `MarkingsStorage`, computa el `clientSubmittedAt` con el `Clock` server-anchored, y delega el POST al puerto `SimulacrosApi.enviar`. El backend valida `inicio ≤ clientSubmittedAt ≤ fin`.

#### Scenario: Envío exitoso dentro de ventana

- **WHEN** el alumno toca "Enviar" dentro de la ventana del simulacro y la red está disponible
- **THEN** `EnviarSimulacroUseCase.execute(simulacroId)` invoca `SimulacrosApi.enviar` con `{ answers, clientSubmittedAt }`
- **AND** el backend responde 200 con `status: "enviado"`
- **AND** el use case devuelve un resultado de éxito
- **AND** la UI navega a `/home` mostrando el simulacro como `enviado`
- **AND** las marcaciones locales del simulacro se borran de `MarkingsStorage`

#### Scenario: Idempotencia — envío duplicado

- **WHEN** se invoca `EnviarSimulacroUseCase` para un simulacro que ya fue enviado
- **THEN** el backend responde 409 con `{ estado: "enviado", clientSubmittedAt }`
- **AND** el use case lo trata como éxito (no como error)
- **AND** la UI navega a `/home` y refleja el estado real

#### Scenario: Backend rechaza por `clientSubmittedAt` fuera de ventana

- **WHEN** el `clientSubmittedAt` enviado cae fuera de `[inicio, fin]`
- **THEN** el backend responde 400 con `code: "INVALID_TIME"`
- **AND** el use case rechaza con `InvalidSubmissionTimeError`
- **AND** la UI muestra un error de operación

#### Scenario: Backend reporta simulacro ya cerrado

- **WHEN** el backend responde 403 con `code: "CLOSED"`
- **THEN** el use case rechaza con `SimulacroCerradoError`
- **AND** la UI muestra "Este simulacro ya cerró" y navega a `/home`

#### Scenario: Backend reporta shape inválido

- **WHEN** el backend responde 400 con `code: "INVALID_SHAPE"`
- **THEN** el use case rechaza con `InvalidPayloadError`
- **AND** la UI muestra "Hubo un error inesperado, intenta de nuevo"

#### Scenario: Backend reporta simulacro no asignado

- **WHEN** el backend responde 404
- **THEN** el use case rechaza con `SimulacroNoAsignadoError`
- **AND** la UI navega a `/home` y refresca la lista

#### Scenario: Sesión expirada durante envío

- **WHEN** el backend responde 401
- **THEN** el use case rechaza con `SessionExpiredError`
- **AND** la lógica de logout silencioso de Fase 1 procede

### Requirement: Envío offline en cola con retry automático

Cuando el POST falla por error de red, el sistema SHALL persistir el envío como pendiente en `MarkingsStorage` (cola) y reintentarlo automáticamente cuando `Connectivity.isOnline` pase a `true`. El `clientSubmittedAt` original se preserva entre el momento del intento y el envío exitoso.

#### Scenario: Envío sin red queda encolado

- **WHEN** el alumno toca "Enviar" sin conexión a las 8:55
- **THEN** el use case captura el `clientSubmittedAt = 8:55`
- **AND** persiste el envío pendiente con `(simulacroId, answers, clientSubmittedAt: 8:55)` en la cola
- **AND** la UI muestra estado "Pendiente de envío..."

#### Scenario: Retry cuando vuelve la red

- **WHEN** un envío estaba pendiente y `Connectivity.isOnline` cambia a `true`
- **THEN** `RetomarEnviosPendientesUseCase` despacha el POST con el `clientSubmittedAt` original
- **AND** el backend responde 200 con `status: "enviado"` y el `clientSubmittedAt` se respeta
- **AND** la entrada de la cola se elimina

#### Scenario: Retry persiste tras reinicio de app

- **WHEN** un envío estaba pendiente, el alumno cerró la PWA y la vuelve a abrir con red
- **THEN** la app detecta el envío pendiente en la cola al arrancar
- **AND** lo despacha automáticamente

### Requirement: Auto-envío silencioso a T=0 con jitter

El sistema SHALL programar un auto-envío que se dispara exactamente cuando `serverTime` llega a `fin` del simulacro, con `clientSubmittedAt = fin`. Para mitigar thundering herd, el timer aplica un jitter aleatorio uniforme en `[-3s, +3s]`. El auto-envío usa el mismo camino que `EnviarSimulacroUseCase`, así que respeta la cola offline.

#### Scenario: Auto-envío con red disponible

- **WHEN** el alumno está marcando un simulacro y el countdown llega a `fin`
- **THEN** el sistema dispara el POST con `clientSubmittedAt = fin` y las answers actuales
- **AND** el backend responde 200 con `status: "enviado"`
- **AND** la UI navega a `/home` mostrando el simulacro como `enviado`

#### Scenario: Auto-envío sin red queda encolado preservando `clientSubmittedAt = fin`

- **WHEN** el countdown llega a `fin` y no hay red
- **THEN** el envío queda encolado con `clientSubmittedAt = fin`
- **AND** cuando la red vuelve, el POST se envía y el backend lo acepta como `enviado` a las `fin`

#### Scenario: Jitter aplicado al timer

- **WHEN** se programa un auto-envío para `fin = 9:00:00`
- **THEN** el `setTimeout` efectivo se ajusta por un valor aleatorio en `[-3s, +3s]`
- **AND** el `clientSubmittedAt` enviado SIEMPRE es exactamente `fin`, no el momento del disparo

#### Scenario: Auto-envío cancelado si el alumno envía antes

- **WHEN** el alumno toca "Enviar" manualmente antes de `fin`
- **THEN** el timer del auto-envío se cancela
- **AND** se procesa el envío manual con `clientSubmittedAt = <momento del toque>`

### Requirement: El `clientSubmittedAt` se computa con el `Clock` server-anchored

El cálculo de `clientSubmittedAt` SHALL usar el puerto `Clock` (L1) que aplica el offset capturado en el último GET /simulacros. NUNCA se usa `Date.now()` directo.

#### Scenario: clientSubmittedAt anclado al server

- **WHEN** el último GET reportó `serverTime` 5 segundos delante del reloj local
- **AND** el alumno toca "Enviar" cuando su reloj local marca 8:47:00
- **THEN** el `clientSubmittedAt` calculado es 8:47:05 (server-anchored)

### Requirement: Errores de dominio para envío

La capa L1 SHALL definir los errores `InvalidSubmissionTimeError`, `SimulacroCerradoError`, `SimulacroNoAsignadoError`, `InvalidPayloadError`. Estos errores los emite la capa L2 cuando el adapter HTTP traduce las respuestas del backend según el mapeo `(status, endpoint)`.

#### Scenario: Mapeo de 400 INVALID_TIME

- **WHEN** el backend responde 400 con `code: "INVALID_TIME"` al POST /simulacros/:id/envio
- **THEN** el adapter HTTP lanza `InvalidSubmissionTimeError`

#### Scenario: Mapeo de 403 CLOSED

- **WHEN** el backend responde 403 con `code: "CLOSED"`
- **THEN** el adapter HTTP lanza `SimulacroCerradoError`

#### Scenario: Mapeo de 404

- **WHEN** el backend responde 404
- **THEN** el adapter HTTP lanza `SimulacroNoAsignadoError`

#### Scenario: Clasificación por (status, endpoint) no por mensaje

- **WHEN** el backend responde 400 con cualquier `message`
- **THEN** el adapter clasifica solo por `code` del body o por endpoint, nunca por el `message`
