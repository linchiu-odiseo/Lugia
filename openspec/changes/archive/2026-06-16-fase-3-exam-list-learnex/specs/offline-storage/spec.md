# Delta for offline-storage

## MODIFIED Requirements

### Requirement: Puerto `MarkingsStorage` en L1

La capa L1 SHALL definir el puerto `MarkingsStorage` con operaciones para persistir y recuperar marcaciones por examen, listar exámenes con marcaciones, borrar las marcaciones de un examen, y administrar la cola de envíos pendientes. El puerto es puro y no depende de ningún tipo de Angular ni del browser.

Los parámetros nominados `simulacroId` en las firmas del puerto MUST renombrarse a `examId` para alinear con el vocabulario del dominio. Las claves IDB internas (segmento `"simulacro"` como string runtime, ej. `cartilla.<email>.simulacro.<examId>`) NO se migran en este change — conservan el literal `"simulacro"` por compatibilidad con datos IDB existentes. Esta deuda está flaggeada para un change de limpieza futuro.
(Previously: parámetro nombrado `simulacroId` en todas las firmas del puerto.)

(Scenarios match merged version in main specs.)

### Requirement: Adapter `IndexedDbMarkingsStorage` en L3

La capa L3 SHALL implementar `IndexedDbMarkingsStorage` que cumple el puerto `MarkingsStorage` usando IndexedDB del navegador. Las claves SHALL estar scopeadas por `userEmail` del bearer activo siguiendo el patrón `cartilla.<userEmail>.simulacro.<examId>` para marcaciones y `cartilla.<userEmail>.queue` para envíos pendientes. El segmento `"simulacro"` en la clave IDB es un literal runtime que NO cambia en este change — el rename afecta solo el nombre del parámetro en código TypeScript, no la estructura de almacenamiento.
(Previously: idéntico excepto que el parámetro TypeScript se llamaba `simulacroId`; estructura de claves IDB sin cambio.)

(Scenarios and remaining requirements match merged version in main specs.)

## ADDED Requirements

### Requirement: Rename de campo simulacroId a examId en entidad Marcacion

La entidad `Marcacion` (L1) SHALL usar el campo `examId` en lugar de `simulacroId`. La semántica y shape del campo son idénticos; solo el nombre cambia para alinear con el vocabulario del dominio. Todos los use cases que propaguen `simulacroId` SHALL actualizarse para usar `examId` (rename puro, sin cambio de comportamiento).

#### Scenario: Marcacion construida con examId

- **GIVEN** los parámetros de construcción de `Marcacion`
- **WHEN** se crea una instancia
- **THEN** el campo de identificación del examen se accede como `marcacion.examId`
- **AND** no existe `marcacion.simulacroId`
