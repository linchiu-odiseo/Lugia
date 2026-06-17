# Delta for exam-marking

## ADDED Requirements

### Requirement: Modal de comprobante shape

La capa LR SHALL exponer un componente standalone `<app-submission-receipt-modal>` con inputs `[ack]: SubmissionAck` (requerido) y output `(close): EventEmitter<void>`. El modal:
- Renderiza centrado sobre la pantalla con un backdrop oscuro y `backdrop-filter: blur(6px)`.
- Contiene un check ícono verde en círculo, título "Envío exitoso" y subtítulo "Pendiente de calificación.".
- Muestra la hora del servidor (`ack.submittedAt`) formateada como `"HH:MM — DD mmm YYYY"` (mes en español abreviado).
- Muestra el `ack.submissionHash` en bloque 4×4×4 (ver Requirement "Hash visible 4×4×4").
- Tiene un único botón "Volver al inicio" que emite `(close)`.
- Aplica pulso háptico (`navigator.vibrate([40])`) al inicializarse, reusando el patrón de fila editing.
- Su backdrop NO cierra el modal por click — solo el botón cierra (es un recibo, no un toast).

#### Scenario: Modal renderiza datos del ack

- **GIVEN** un `ack` con `submissionHash = "a3f5c8d1b2e4f6a8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"`, `submittedAt = Date("2026-06-17T15:29:54.531Z")`
- **WHEN** se renderiza `<app-submission-receipt-modal [ack]="ack">`
- **THEN** el template muestra "Envío exitoso", "Pendiente de calificación.", el hash en 4 líneas, y la hora `"15:29 — 17 jun 2026"`

#### Scenario: Modal emite close al tocar el botón

- **GIVEN** el modal renderizado
- **WHEN** el usuario toca "Volver al inicio"
- **THEN** el componente emite `close` (sin payload)

### Requirement: Hash visible 4×4×4

El componente del modal SHALL renderizar el `ack.submissionHash` (64 chars hex) dividido en 4 líneas, cada línea con 4 grupos de 4 chars separados por un espacio. La tipografía es monoespaciada (JetBrains Mono).

#### Scenario: Hash de 64 chars produce 4 líneas

- **GIVEN** `submissionHash = "a3f5c8d1b2e4f6a8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"`
- **WHEN** el helper `formatHashBlock(hash)` se evalúa
- **THEN** retorna `["a3f5 c8d1 b2e4 f6a8", "c9d0 e1f2 a3b4 c5d6", "e7f8 a9b0 c1d2 e3f4", "a5b6 c7d8 e9f0 a1b2"]`

#### Scenario: Hash de longitud inválida no crashea

- **GIVEN** un hash de longitud distinta a 64 (defensa contra bug del adapter)
- **WHEN** `formatHashBlock(hash)` se evalúa
- **THEN** el componente loguea un warning y renderiza el hash en una sola línea o vacío sin crashear

### Requirement: Modal aparece tras 201 en /simulacro

El view-model `SimulacroPageViewModel` SHALL exponer `readonly lastAck = signal<SubmissionAck | null>(null)`. En el path síncrono de `submit()`: cuando `EnviarSimulacroUseCase` retorna `{ status: 'enviado', ack }` con `ack !== null`, el view-model SHALL setear `lastAck(ack)` y NO navegar inmediatamente. El template del page SHALL renderizar `<app-submission-receipt-modal>` cuando `lastAck() !== null`. Cuando el modal emite `(close)`, el view-model SHALL invocar `onReceiptClose()` que limpia el signal y navega a `/home`.

#### Scenario: Submit exitoso muestra modal y no navega

- **GIVEN** `EnviarSimulacroUseCase` retorna `{ status: 'enviado', ack: validAck }`
- **WHEN** el view-model procesa el éxito de `submit()`
- **THEN** `lastAck()` es igual a `validAck`
- **AND** `Router.navigate` NO es invocado en este momento

#### Scenario: Modal dismiss navega a /home

- **GIVEN** `lastAck() !== null`
- **WHEN** el modal emite `(close)` y el view-model invoca `onReceiptClose()`
- **THEN** `lastAck()` vuelve a `null`
- **AND** `Router.navigate(['/home'])` es invocado

#### Scenario: Submit queued NO muestra modal

- **GIVEN** `EnviarSimulacroUseCase` retorna `{ status: 'queued', ack: null }`
- **WHEN** el view-model procesa el resultado
- **THEN** `lastAck()` permanece `null`
- **AND** el modal NO se renderiza
- **AND** `submissionState` es `'queued'`

### Requirement: Botón Enviar deshabilitado tras 201

Cuando `lastAck() !== null` en `/simulacro`, el botón "Enviar" del footer SHALL estar deshabilitado visualmente (clase `disabled`, color atenuado) y NO responder a clicks. Es UX defensiva — la idempotencia server-side ya cubre el caso, pero queremos que el alumno entienda que no debe volver a intentar.

#### Scenario: Botón Enviar disabled cuando hay ack

- **GIVEN** `vm.lastAck() !== null` en el template
- **THEN** el elemento `<button>` de Enviar tiene `disabled` y clase atenuada
- **AND** un click sobre él NO invoca `vm.submit()`

### Requirement: Card "enviado" con ack real

El `HomePageViewModel.composeEstado` SHALL retornar `'enviado'` cuando el examen tiene un ack persistido (`getSubmissionAck(examId) !== null`), independientemente de si `serverStatus` es `'in_progress'` o `'finalized'`. Esto reemplaza la lógica anterior basada en el booleano `hasSubmittedAck`.

#### Scenario: in_progress con ack → enviado

- **GIVEN** un examen con `serverStatus: 'in_progress'` y un `SubmissionAck` persistido
- **WHEN** `composeEstado(exam, ack)` se evalúa
- **THEN** retorna `'enviado'`

#### Scenario: finalized con ack → enviado

- **GIVEN** un examen con `serverStatus: 'finalized'` y un `SubmissionAck` persistido
- **WHEN** `composeEstado(exam, ack)` se evalúa
- **THEN** retorna `'enviado'`

#### Scenario: finalized sin ack → cerrado

- **GIVEN** un examen con `serverStatus: 'finalized'` y `null` ack
- **WHEN** `composeEstado(exam, null)` se evalúa
- **THEN** retorna `'cerrado'`

### Requirement: Card enviado muestra HH:MM del server

El `HomePageViewModel.primaryText(exam, estado: 'enviado', ack)` SHALL retornar `` `Enviado · ${formatHHMM(ack.submittedAt)}` ``. Usa el timestamp real del server (`ack.submittedAt`), NO `exam.effectiveCloseAt()`.

#### Scenario: primaryText usa ack.submittedAt

- **GIVEN** un `ack` con `submittedAt = Date("2026-06-17T15:29:54.531Z")`
- **WHEN** `primaryText(exam, 'enviado', ack)` se evalúa
- **THEN** retorna `"Enviado · 15:29"` (asumiendo timezone que renderiza ese ISO como 15:29)

### Requirement: secondaryText pendiente de calificación

El `HomePageViewModel.secondaryText(exam, estado)` SHALL retornar `"Pendiente de calificación"` cuando `estado === 'enviado'`. Para los demás estados conserva la lógica existente (`area ?? course ?? '—'` + número de preguntas).

#### Scenario: secondaryText en estado enviado

- **GIVEN** un examen en estado `enviado`
- **WHEN** `secondaryText(exam, 'enviado')` se evalúa
- **THEN** retorna `"Pendiente de calificación"`

#### Scenario: secondaryText en estado abierto conserva lógica previa

- **GIVEN** un examen en estado `abierto` con `area: "Mate"`, `count: 90`
- **WHEN** `secondaryText(exam, 'abierto')` se evalúa
- **THEN** retorna `"Mate · 90 preguntas"`

### Requirement: Copy banner queued (sin botón manual)

El banner `--queued` en `/simulacro` SHALL mostrar el copy "Sin conexión. Tus respuestas se enviarán automáticamente cuando vuelva la red." sin ningún botón ni control adicional. El reintento es 100% automático vía `EnvioRetryDispatcher` cableado a `Connectivity.isOnline` (sin cambio respecto a `fase-3-exam-list-learnex`).

#### Scenario: Banner queued no tiene botón

- **WHEN** el banner queued se renderiza en `/simulacro`
- **THEN** NO existe un `<button>` con copy "Reintentar ahora" ni similar
- **AND** el texto exacto es "Sin conexión. Tus respuestas se enviarán automáticamente cuando vuelva la red."

## MODIFIED Requirements

### Requirement: Cleanup del branch SubmissionNotAvailableError en view-model

El `SimulacroPageViewModel.handleSubmissionError` SHALL NO contener ningún branch para `SubmissionNotAvailableError`. El import de la clase SHALL eliminarse. El tipo `SimulacroErrorState` NO incluye estados específicos de ese error.
(Previously: existía un branch que devolvía estado `idle` silenciosamente como degradación del stub.)

#### Scenario: View-model no importa SubmissionNotAvailableError

- **WHEN** se inspecciona `src/LR_render/view-models/simulacro.view-model.ts`
- **THEN** no hay `import` de `SubmissionNotAvailableError`
- **AND** no hay branch `instanceof SubmissionNotAvailableError`

### Requirement: Card --enviado se compone con ack !== null

La card visual `--enviado` en `/home` SHALL renderizarse cuando `getSubmissionAck(exam.id)` retorna un `SubmissionAck`, independientemente del `serverStatus`. Hoy esa lógica existe pero `getSubmissionAck` no existía (era `hasSubmittedAck` que retornaba `false` fake); este requirement formaliza la activación real.
(Previously: dead-code intencional — la rama existía pero nunca se ejecutaba en runtime.)

#### Scenario: Card enviado se renderiza con ack persistido

- **GIVEN** un examen visible en `/home` con `getSubmissionAck(exam.id)` retornando un `SubmissionAck` no-null
- **WHEN** el `HomePageViewModel.cards` recompone
- **THEN** la card correspondiente tiene `estado === 'enviado'` y aplica la clase CSS `card--enviado`
- **AND** muestra el ícono `check_circle` en verde

#### Scenario: Card abierto cuando ack es null

- **GIVEN** un examen con `serverStatus: 'in_progress'` y `getSubmissionAck(exam.id)` retornando `null`
- **WHEN** la card se compone
- **THEN** `estado === 'abierto'` y NO se aplica `card--enviado`
