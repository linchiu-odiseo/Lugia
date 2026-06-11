## ADDED Requirements

### Requirement: Pantalla de marcación de un simulacro abierto

La UI (LR_render) SHALL exponer una página `/simulacro/:id` que muestra una grilla de `count` preguntas, cada una con bubbles seleccionables A, B, C, D, E. La página solo es accesible si el simulacro está `abierto`. NO muestra enunciados (el alumno los tiene en papel).

#### Scenario: Acceso a simulacro abierto

- **WHEN** el alumno navega a `/simulacro/:id` y el simulacro está `abierto`
- **THEN** se muestra la grilla con `count` filas, una por pregunta
- **AND** cada fila ofrece cinco bubbles A–E

#### Scenario: Bloqueo de acceso a simulacro pendiente

- **WHEN** el alumno navega a `/simulacro/:id` y el simulacro está `pendiente`
- **THEN** la PWA redirige a `/home`
- **AND** muestra un mensaje "El simulacro aún no está disponible"

#### Scenario: Bloqueo de acceso a simulacro cerrado

- **WHEN** el alumno navega a `/simulacro/:id` y el simulacro está `cerrado`
- **THEN** la PWA redirige a `/home`
- **AND** muestra un mensaje "Este simulacro ya cerró"

#### Scenario: Bloqueo de acceso a simulacro enviado

- **WHEN** el alumno navega a `/simulacro/:id` y el simulacro está `enviado`
- **THEN** la PWA redirige a `/home`
- **AND** muestra un mensaje "Ya enviaste este simulacro"

### Requirement: Marcar una respuesta persiste localmente al instante

El sistema SHALL exponer `MarcarRespuestaUseCase` (L2) que recibe `(simulacroId, preguntaNumero, alternativa)` y persiste la marca vía el puerto `MarkingsStorage` (L1). La operación NO requiere conexión a internet.

#### Scenario: Marca de una alternativa válida

- **WHEN** el alumno toca la alternativa C de la pregunta 5 del simulacro X
- **THEN** `MarcarRespuestaUseCase.execute({ simulacroId: X, pregunta: 5, alternativa: "C" })` se invoca
- **AND** la marca queda persistida en `MarkingsStorage` antes de devolver control a la UI
- **AND** la UI refleja la selección visualmente sin esperar respuesta de red

#### Scenario: Cambio de marca en la misma pregunta

- **WHEN** el alumno tenía marcada C en la pregunta 5 y toca A
- **THEN** la marca persistida cambia a A
- **AND** la UI refleja A como seleccionada y C como deseleccionada

#### Scenario: Desmarcar (toca la misma alternativa ya seleccionada)

- **WHEN** el alumno tiene C marcada en la pregunta 5 y toca C de nuevo
- **THEN** la pregunta 5 queda sin marca (valor `null`)
- **AND** la UI refleja todas las bubbles deseleccionadas

#### Scenario: Alternativa inválida rechazada

- **WHEN** se invoca `MarcarRespuestaUseCase` con una alternativa fuera de A–E
- **THEN** el use case lanza `InvalidAlternativaError`
- **AND** nada se persiste

### Requirement: Recuperación de marcaciones al reabrir la pantalla

La pantalla `/simulacro/:id` SHALL leer del puerto `MarkingsStorage` al montar y reconstruir el estado visual con todas las marcaciones previas del alumno para ese simulacro.

#### Scenario: Reapertura tras cierre de app

- **WHEN** el alumno había marcado preguntas 1–10, cerró la PWA, y vuelve a abrir `/simulacro/:id`
- **THEN** la grilla muestra las preguntas 1–10 con sus respuestas marcadas
- **AND** las preguntas 11–20 quedan sin marca

#### Scenario: Reapertura tras navegar a /home y volver

- **WHEN** el alumno entró a un simulacro, marcó algunas preguntas, volvió a `/home`, y vuelve a entrar
- **THEN** las marcaciones previas se restauran

### Requirement: Navegación libre entre `/home` y un simulacro `abierto`

La UI SHALL permitir al alumno volver a `/home` desde cualquier simulacro abierto sin enviar, y reentrar al mismo simulacro mientras siga abierto.

#### Scenario: Salida sin envío

- **WHEN** el alumno está en `/simulacro/:id` con marcas pendientes y toca "Volver"
- **THEN** navega a `/home`
- **AND** las marcaciones permanecen en `MarkingsStorage`
- **AND** el simulacro sigue en estado `abierto`

### Requirement: Entidad `Marcacion` y value-object `Alternativa` en L1

La capa L1 SHALL definir la entidad `Marcacion` con `(simulacroId, pregunta, alternativa)` y el value-object `Alternativa` que solo admite "A" | "B" | "C" | "D" | "E" | null.

#### Scenario: Construcción válida

- **WHEN** se construye `Marcacion(simulacroId, 5, Alternativa.fromString("C"))`
- **THEN** la entidad existe sin errores
- **AND** `marcacion.alternativa.value` es "C"

#### Scenario: Alternativa null para desmarcado

- **WHEN** se construye `Alternativa.fromString(null)`
- **THEN** el value-object existe con `value === null`

#### Scenario: Alternativa inválida rechazada

- **WHEN** se intenta construir `Alternativa.fromString("F")`
- **THEN** se lanza `InvalidAlternativaError`
