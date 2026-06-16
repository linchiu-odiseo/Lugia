# offline-storage Specification

## Purpose
Provides IndexedDB-backed persistent storage for exam markings and submission queue, scoped by user email with automatic wipe on logout.

## Requirements

### Requirement: Puerto `MarkingsStorage` en L1

La capa L1 SHALL definir el puerto `MarkingsStorage` con operaciones para persistir y recuperar marcaciones por examen, listar exámenes con marcaciones, borrar las marcaciones de un examen, y administrar la cola de envíos pendientes. El puerto es puro y no depende de ningún tipo de Angular ni del browser.

Los parámetros nominados `simulacroId` en las firmas del puerto MUST renombrarse a `examId` para alinear con el vocabulario del dominio. Las claves IDB internas (segmento `"simulacro"` como string runtime, ej. `cartilla.<email>.simulacro.<examId>`) NO se migran en este change — conservan el literal `"simulacro"` por compatibilidad con datos IDB existentes. Esta deuda está flaggeada para un change de limpieza futuro.

#### Scenario: Persistir una marcación con parámetro examId

- **WHEN** se invoca `MarkingsStorage.setMarcacion(examId, pregunta, alternativa)`
- **THEN** la marcación queda persistida y recuperable

#### Scenario: Leer todas las marcaciones de un examen

- **WHEN** se invoca `MarkingsStorage.getMarcaciones(examId)`
- **THEN** devuelve un objeto `{ "1": "C", "2": "A", "3": null, ... }` con las marcaciones actuales

#### Scenario: Borrar marcaciones tras envío exitoso

- **WHEN** se invoca `MarkingsStorage.clearMarcaciones(examId)`
- **THEN** las marcaciones de ese examen se eliminan
- **AND** un `getMarcaciones` posterior devuelve objeto vacío

#### Scenario: Encolar envío pendiente con examId

- **WHEN** se invoca `MarkingsStorage.enqueueEnvio({ examId, answers, clientSubmittedAt })`
- **THEN** el envío queda persistido en la cola

#### Scenario: Listar envíos pendientes al arrancar

- **WHEN** se invoca `MarkingsStorage.getEnviosPendientes()`
- **THEN** devuelve la lista de envíos pendientes con su `clientSubmittedAt` original y `examId`

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
