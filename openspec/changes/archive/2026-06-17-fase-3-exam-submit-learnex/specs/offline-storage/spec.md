# Delta for offline-storage

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Puerto `MarkingsStorage` en L1

La capa L1 SHALL definir el puerto `MarkingsStorage` con operaciones para persistir y recuperar marcaciones por examen, listar exámenes con marcaciones, borrar las marcaciones de un examen, administrar la cola de envíos pendientes, y persistir/recuperar el comprobante criptográfico (`SubmissionAck`) por examen. El puerto es puro y no depende de ningún tipo de Angular ni del browser.

El método `hasSubmittedAck(examId): Promise<boolean>` introducido en `fase-3-exam-list-learnex` se REEMPLAZA por `getSubmissionAck(examId): Promise<SubmissionAck | null>` — la ausencia de ack se representa con `null`; la presencia del ack permite acceder a `id`, `submissionHash` y `submittedAt`.
(Previously: `hasSubmittedAck` retornaba `boolean`; no había `setSubmissionAck` ni `getSubmissionAck` que retornaran el VO.)

#### Scenario: Interfaz expone setSubmissionAck y getSubmissionAck

- **WHEN** se inspecciona el tipo `MarkingsStorage` exportado desde `src/L1_domain/ports/markings-storage.ts`
- **THEN** existen los métodos `setSubmissionAck(examId: string, ack: SubmissionAck): Promise<void>` y `getSubmissionAck(examId: string): Promise<SubmissionAck | null>`
- **AND** NO existe `hasSubmittedAck`

#### Scenario: Puerto sigue puro sin Angular ni browser

- **WHEN** se inspecciona la lista de imports de `markings-storage.ts`
- **THEN** no aparece ninguna referencia a `@angular/*`, `rxjs`, `window`, ni APIs del browser

## REMOVED Requirements

### Requirement ELIMINADO: MarkingsStorage.hasSubmittedAck

El método `hasSubmittedAck(examId): Promise<boolean>` SHALL eliminarse de la interfaz `MarkingsStorage`. Su única razón de ser fue actuar como seam dead-code mientras el POST era stub; con el POST real y `getSubmissionAck` disponible, el booleano se deriva trivialmente como `(await getSubmissionAck(examId)) !== null`.
