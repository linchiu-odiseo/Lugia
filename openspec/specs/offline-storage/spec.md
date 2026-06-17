# offline-storage Specification

## Purpose
Provides IndexedDB-backed persistent storage for exam markings and submission queue, scoped by user email with automatic wipe on logout.

## Requirements

### Requirement: Puerto `MarkingsStorage` en L1

La capa L1 SHALL definir el puerto `MarkingsStorage` con operaciones para persistir y recuperar marcaciones por examen, listar exámenes con marcaciones, borrar las marcaciones de un examen, administrar la cola de envíos pendientes, y persistir/recuperar el comprobante criptográfico (`SubmissionAck`) por examen. El puerto es puro y no depende de ningún tipo de Angular ni del browser.

El método `hasSubmittedAck(examId): Promise<boolean>` introducido en `fase-3-exam-list-learnex` se REEMPLAZA por `getSubmissionAck(examId): Promise<SubmissionAck | null>` — la ausencia de ack se representa con `null`; la presencia del ack permite acceder a `id`, `submissionHash` y `submittedAt`.

#### Scenario: Interfaz expone setSubmissionAck y getSubmissionAck

- **WHEN** se inspecciona el tipo `MarkingsStorage` exportado desde `src/L1_domain/ports/markings-storage.ts`
- **THEN** existen los métodos `setSubmissionAck(examId: string, ack: SubmissionAck): Promise<void>` y `getSubmissionAck(examId: string): Promise<SubmissionAck | null>`
- **AND** NO existe `hasSubmittedAck`

#### Scenario: Puerto sigue puro sin Angular ni browser

- **WHEN** se inspecciona la lista de imports de `markings-storage.ts`
- **THEN** no aparece ninguna referencia a `@angular/*`, `rxjs`, `window`, ni APIs del browser

### Requirement: Adapter `IndexedDbMarkingsStorage` en L3

La capa L3 SHALL implementar `IndexedDbMarkingsStorage` que cumple el puerto `MarkingsStorage` usando IndexedDB del navegador. Las claves SHALL estar scopeadas por `userEmail` del bearer activo siguiendo el patrón `cartilla.<userEmail>.simulacro.<examId>` para marcaciones y `cartilla.<userEmail>.queue` para envíos pendientes. El segmento `"simulacro"` en la clave IDB es un literal runtime que NO cambia en este change — el rename afecta solo el nombre del parámetro en código TypeScript, no la estructura de almacenamiento.

#### Scenario: Scope por userEmail evita contaminación entre usuarios

- **WHEN** el usuario A persiste marcaciones, hace logout, y el usuario B inicia sesión en el mismo dispositivo
- **THEN** el usuario B NO ve las marcaciones del usuario A
- **AND** las marcaciones del usuario A están bajo claves con su email, distintas a las del B

#### Scenario: Wipe scoped en logout

- **WHEN** se invoca `LogoutUseCase` y existen marcaciones del usuario actual
- **THEN** todas las claves bajo `cartilla.<userEmail>.*` se eliminan
- **AND** los datos de otros usuarios persistidos en el mismo dispositivo permanecen intactos

#### Scenario: Envíos pendientes encolados también se descartan en logout

- **WHEN** se invoca `LogoutUseCase` y hay envíos en cola
- **THEN** la cola del usuario actual se elimina
- **AND** los envíos pendientes NO se procesan post-logout

#### Scenario: Clave IDB retiene segmento "simulacro" aunque el parámetro sea examId

- **GIVEN** el adapter persiste una marcación con `examId = "exam-42"`
- **WHEN** se inspecciona la clave IDB creada
- **THEN** la clave es `cartilla.<userEmail>.simulacro.exam-42` (NO `cartilla.<userEmail>.exam.exam-42`)
- **AND** datos IDB de sesiones anteriores (claves con segmento `"simulacro"`) son legibles sin migración

### Requirement: Manejo de IndexedDB no disponible

El adapter `IndexedDbMarkingsStorage` SHALL detectar al construirse si IndexedDB está disponible. Si no, todas sus operaciones rechazan con el error de dominio `OfflineStorageUnavailableError`. La UI muestra un banner y bloquea entrada a cualquier examen mientras el error persista.

#### Scenario: Browser sin IndexedDB

- **WHEN** la app arranca en un navegador que no expone `window.indexedDB`
- **THEN** las operaciones del puerto rechazan con `OfflineStorageUnavailableError`
- **AND** `/home` muestra un banner persistente "Tu navegador no soporta marcaciones offline"
- **AND** los exámenes `open` aparecen visibles pero no clickeables

#### Scenario: IndexedDB falla en runtime

- **WHEN** una operación de `IndexedDbMarkingsStorage` falla con error del browser
- **THEN** el error se mapea a `OfflineStorageUnavailableError`
- **AND** la UI reporta de manera similar al caso de inicio

### Requirement: Recuperación tras cierre de app

Las marcaciones y la cola de envíos pendientes SHALL sobrevivir al cierre de la app y al reinicio del dispositivo. Al volver a abrir la PWA, el estado se reconstruye desde IndexedDB.

#### Scenario: Marcaciones persisten tras cierre

- **WHEN** el alumno marca preguntas en un examen y luego mata el proceso de la app
- **THEN** al reabrir y navegar al mismo examen, las marcaciones siguen visibles

#### Scenario: Cola de envíos procesada al arrancar

- **WHEN** la app arranca y hay envíos pendientes en la cola
- **THEN** `RetomarEnviosPendientesUseCase` se invoca al inicializar
- **AND** los envíos se despachan si hay red, o quedan esperando `Connectivity.isOnline`

### Requirement: Rename de campo simulacroId a examId en entidad Marcacion

La entidad `Marcacion` (L1) SHALL usar el campo `examId` en lugar de `simulacroId`. La semántica y shape del campo son idénticos; solo el nombre cambia para alinear con el vocabulario del dominio. Todos los use cases que propaguen `simulacroId` SHALL actualizarse para usar `examId` (rename puro, sin cambio de comportamiento).

#### Scenario: Marcacion construida con examId

- **GIVEN** los parámetros de construcción de `Marcacion`
- **WHEN** se crea una instancia
- **THEN** el campo de identificación del examen se accede como `marcacion.examId`
- **AND** no existe `marcacion.simulacroId`

### Requirement: MarkingsStorage.setSubmissionAck

La interfaz `MarkingsStorage` (L1) SHALL exponer `setSubmissionAck(examId: string, ack: SubmissionAck): Promise<void>` que persiste el comprobante criptográfico devuelto por el server tras un envío exitoso. El ack persiste independientemente de las marcaciones; sobrevive a logout solo si el mismo usuario vuelve a loguearse (es decir, se borra junto al wipe del scope del usuario).

#### Scenario: setSubmissionAck persiste ack

- **GIVEN** un `ack = new SubmissionAck("uuid", "64hexchars", new Date(...))`
- **WHEN** se invoca `storage.setSubmissionAck("exam-42", ack)`
- **THEN** una llamada posterior a `getSubmissionAck("exam-42")` resuelve con un `SubmissionAck` equivalente

### Requirement: MarkingsStorage.getSubmissionAck

La interfaz `MarkingsStorage` (L1) SHALL exponer `getSubmissionAck(examId: string): Promise<SubmissionAck | null>` que recupera el comprobante persistido, o `null` si no existe entrada para ese `examId`. Reemplaza el booleano `hasSubmittedAck` previo.

#### Scenario: getSubmissionAck retorna null sin entrada

- **GIVEN** no se ha invocado `setSubmissionAck` para `"exam-X"`
- **WHEN** se invoca `storage.getSubmissionAck("exam-X")`
- **THEN** resuelve con `null`

#### Scenario: getSubmissionAck reconstruye SubmissionAck

- **GIVEN** `setSubmissionAck("exam-42", ack)` fue invocado previamente
- **WHEN** se invoca `storage.getSubmissionAck("exam-42")`
- **THEN** resuelve con un `SubmissionAck` cuyos campos `id`, `submissionHash`, `submittedAt` (vía `.getTime()`) son iguales al original

### Requirement: Clave IDB de ack scopeada por userEmail

El adapter `IndexedDbMarkingsStorage` SHALL almacenar los acks bajo el patrón `cartilla.<userEmail>.ack.<examId>`. El `userEmail` se resuelve internamente vía `IdentityStorage`, igual que el resto de operaciones del adapter.

#### Scenario: Patrón de clave IDB para acks

- **GIVEN** el alumno `30303011@vonex.edu.pe` envía el examen `exam-42` con éxito
- **WHEN** se inspecciona el IDB tras `setSubmissionAck`
- **THEN** existe una entrada bajo la clave `cartilla.30303011@vonex.edu.pe.ack.exam-42`

### Requirement: wipeUserScope borra acks del usuario

El método `MarkingsStorage.wipeUserScope()` SHALL eliminar también todas las entradas bajo `cartilla.<userEmail>.ack.*` además de marcaciones y queue.

#### Scenario: Logout borra acks del usuario actual

- **GIVEN** el alumno A tiene un ack persistido para `exam-42`
- **WHEN** el alumno A hace logout (invoca `wipeUserScope`)
- **THEN** `getSubmissionAck("exam-42")` posterior (con el mismo usuario) resuelve con `null`

#### Scenario: Logout preserva acks de otros usuarios

- **GIVEN** el alumno A tiene un ack para `exam-42` y el alumno B tiene un ack para `exam-99`
- **WHEN** el alumno A hace logout
- **THEN** las entradas de A bajo `cartilla.A.ack.*` están eliminadas
- **AND** las entradas de B bajo `cartilla.B.ack.*` permanecen intactas

### Requirement: EnvioPendiente preserva code

La interfaz `EnvioPendiente` (L1) SHALL incluir el campo `code: string` (DNI del alumno) además de `examId`, `responses` y `clientFinishedAt`. Esto permite al `RetomarEnviosPendientesUseCase` reconstruir el body del POST cuando procesa la cola, sin volver a consultar `IdentityStorage` (que podría haber cambiado entre encolado y retry si el alumno hizo logout/login).

#### Scenario: Encolado preserva code en IDB

- **GIVEN** un envío encolado con `code: "30303011"`
- **WHEN** se invoca `storage.getEnviosPendientes()` posteriormente (incluso tras reiniciar la app)
- **THEN** el envío recuperado tiene `code: "30303011"` intacto
