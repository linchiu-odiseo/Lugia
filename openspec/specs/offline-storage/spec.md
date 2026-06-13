# offline-storage Specification

## Purpose
Provides IndexedDB-backed persistent storage for exam markings and submission queue, scoped by user email with automatic wipe on logout.

## Requirements

### Requirement: Puerto `MarkingsStorage` en L1

La capa L1 SHALL definir el puerto `MarkingsStorage` con operaciones para persistir y recuperar marcaciones por simulacro, listar simulacros con marcaciones, borrar las marcaciones de un simulacro, y administrar la cola de envíos pendientes. El puerto es puro y no depende de ningún tipo de Angular ni del browser.

#### Scenario: Persistir una marcación

- **WHEN** se invoca `MarkingsStorage.setMarcacion(simulacroId, pregunta, alternativa)`
- **THEN** la marcación queda persistida y recuperable

#### Scenario: Leer todas las marcaciones de un simulacro

- **WHEN** se invoca `MarkingsStorage.getMarcaciones(simulacroId)`
- **THEN** devuelve un objeto `{ "1": "C", "2": "A", "3": null, ... }` con las marcaciones actuales

#### Scenario: Borrar marcaciones tras envío exitoso

- **WHEN** se invoca `MarkingsStorage.clearMarcaciones(simulacroId)`
- **THEN** las marcaciones de ese simulacro se eliminan
- **AND** un `getMarcaciones` posterior devuelve objeto vacío

#### Scenario: Encolar envío pendiente

- **WHEN** se invoca `MarkingsStorage.enqueueEnvio({ simulacroId, answers, clientSubmittedAt })`
- **THEN** el envío queda persistido en la cola

#### Scenario: Listar envíos pendientes al arrancar

- **WHEN** se invoca `MarkingsStorage.getEnviosPendientes()`
- **THEN** devuelve la lista de envíos pendientes con su `clientSubmittedAt` original

### Requirement: Adapter `IndexedDbMarkingsStorage` en L3

La capa L3 SHALL implementar `IndexedDbMarkingsStorage` que cumple el puerto `MarkingsStorage` usando IndexedDB del navegador. Las claves SHALL estar scopeadas por `userEmail` del bearer activo siguiendo el patrón `cartilla.<userEmail>.simulacro.<simulacroId>` para marcaciones y `cartilla.<userEmail>.queue` para envíos pendientes.

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

### Requirement: Manejo de IndexedDB no disponible

El adapter `IndexedDbMarkingsStorage` SHALL detectar al construirse si IndexedDB está disponible. Si no, todas sus operaciones rechazan con el error de dominio `OfflineStorageUnavailableError`. La UI muestra un banner y bloquea entrada a cualquier simulacro mientras el error persista.

#### Scenario: Browser sin IndexedDB

- **WHEN** la app arranca en un navegador que no expone `window.indexedDB`
- **THEN** las operaciones del puerto rechazan con `OfflineStorageUnavailableError`
- **AND** `/home` muestra un banner persistente "Tu navegador no soporta marcaciones offline"
- **AND** los simulacros `abierto` aparecen visibles pero no clickeables

#### Scenario: IndexedDB falla en runtime

- **WHEN** una operación de `IndexedDbMarkingsStorage` falla con error del browser
- **THEN** el error se mapea a `OfflineStorageUnavailableError`
- **AND** la UI reporta de manera similar al caso de inicio

### Requirement: Recuperación tras cierre de app

Las marcaciones y la cola de envíos pendientes SHALL sobrevivir al cierre de la app y al reinicio del dispositivo. Al volver a abrir la PWA, el estado se reconstruye desde IndexedDB.

#### Scenario: Marcaciones persisten tras cierre

- **WHEN** el alumno marca preguntas en un simulacro y luego mata el proceso de la app
- **THEN** al reabrir y navegar al mismo simulacro, las marcaciones siguen visibles

#### Scenario: Cola de envíos procesada al arrancar

- **WHEN** la app arranca y hay envíos pendientes en la cola
- **THEN** un use case `RetomarEnviosPendientesUseCase` se invoca al inicializar
- **AND** los envíos se despachan si hay red, o quedan esperando `Connectivity.isOnline`
