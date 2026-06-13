## ADDED Requirements

### Requirement: Puerto `Clock` server-anchored en L1

La capa L1 SHALL definir el puerto `Clock` que expone `now(): Date` (o equivalente) devolviendo la hora actual ajustada por el `offset` capturado del backend. NO se usa `Date.now()` directo en L1, L2 o en lógica de dominio fuera de este puerto.

#### Scenario: Lectura sin offset previo

- **WHEN** se construye el `Clock` y aún no se ha capturado un `serverTime`
- **THEN** `clock.now()` devuelve la hora local sin ajuste (offset = 0)

#### Scenario: Lectura con offset positivo

- **WHEN** el último GET reportó `serverTime` 5 segundos delante del reloj local
- **AND** el reloj local marca 8:47:00
- **THEN** `clock.now()` devuelve 8:47:05

#### Scenario: Lectura con offset negativo

- **WHEN** el último GET reportó `serverTime` 3 segundos detrás del reloj local
- **AND** el reloj local marca 8:47:00
- **THEN** `clock.now()` devuelve 8:46:57

### Requirement: Captura del `serverTime` en cada respuesta de GET /simulacros

El adapter HTTP `HttpSimulacrosApi` (L3) SHALL extraer el `serverTime` del payload de cada `GET /v3/simulacros` y entregarlo al `Clock` server-anchored para actualizar el offset.

#### Scenario: Offset actualizado en cada GET

- **WHEN** llega una respuesta de `GET /v3/simulacros` con `serverTime` `2026-06-12T08:15:05-05:00`
- **AND** el reloj local del cliente marca `2026-06-12T08:15:00-05:00`
- **THEN** el offset se actualiza a +5 segundos
- **AND** las lecturas posteriores de `clock.now()` reflejan el nuevo offset

#### Scenario: GETs sucesivos con drift gradual

- **WHEN** sucesivos GETs reportan `serverTime` ligeramente distintos
- **THEN** el offset se reajusta en cada respuesta
- **AND** no se acumula drift histórico

### Requirement: Adapter `ServerAnchoredClock` en L3

La capa L3 SHALL implementar `ServerAnchoredClock` que cumple el puerto `Clock`. Internamente mantiene el `offsetMs` actualizado, con valor inicial `0`. Expone un método `setServerTime(serverTime: Date)` invocado por el adapter HTTP.

#### Scenario: Adapter inicializa con offset cero

- **WHEN** el `ServerAnchoredClock` se construye por primera vez
- **THEN** `clock.now()` devuelve `new Date()` exactamente

#### Scenario: Adapter expone método para actualizar offset

- **WHEN** se invoca `clock.setServerTime(serverTime)` con un timestamp del backend
- **THEN** el offset interno se recalcula como `serverTime.getTime() - Date.now()`

### Requirement: Countdowns en la UI usan el `Clock` server-anchored

Los view-models de `/home` y `/simulacro/:id` SHALL usar el `Clock` server-anchored para todos los countdowns visibles al alumno ("Cierra a las HH:MM · MM min restantes", "Disponible a las HH:MM").

#### Scenario: Countdown anclado al server, no al reloj local

- **WHEN** el alumno cambia la hora de su celular 10 minutos hacia atrás
- **THEN** los countdowns siguen reflejando la hora real del servidor (sin retroceder 10 min)
- **AND** el bloqueo de entrada a simulacros se mantiene correcto

#### Scenario: Countdown se actualiza periódicamente

- **WHEN** un simulacro está abierto y la UI muestra "45 min restantes"
- **THEN** el view-model recalcula el countdown cada segundo usando `clock.now()`
- **AND** la UI refleja el cambio sin parpadeo

### Requirement: Persistencia del offset entre navegaciones

El offset capturado SHALL persistir mientras la app esté abierta. Una nueva navegación dentro de la PWA NO debe resetear el offset.

#### Scenario: Offset sobrevive navegación

- **WHEN** el alumno está en `/home` con offset = +5s, navega a `/simulacro/:id` y vuelve a `/home`
- **THEN** el offset sigue siendo +5s
- **AND** no se requiere un GET extra para reanclar
