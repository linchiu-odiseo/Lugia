## MODIFIED Requirements

### Requirement: Protección contra cambios accidentales una vez marcada una respuesta

La UI SHALL proteger respuestas ya marcadas contra cambios o borrados accidentales por toques no intencionales. El primer marcado de una pregunta vacía es de un solo tap (fricción cero); cualquier modificación posterior requiere un gesto deliberado (long-press de 500ms en la fila) que entra a modo `editing` por 5 segundos, durante los cuales un tap simple aplica el cambio o el borrado.

#### Scenario: Tap simple en burbuja de fila bloqueada no cambia la marca

- **WHEN** la pregunta 5 está marcada en A (fila `locked`) y el alumno toca B
- **THEN** la marca persistida y la UI permanecen sin cambio (sigue A)
- **AND** la UI NO muestra ningún toast, banner ni hint inline — el feedback de "no se cambió nada" es la propia ausencia de cambio visual

#### Scenario: Long-press en fila bloqueada entra a modo edición con chip permanente

- **WHEN** el alumno mantiene presionada cualquier zona de una fila `locked` durante 500ms sin levantar el dedo ni moverlo más de 10px
- **THEN** la fila pasa a estado `editing`
- **AND** la UI resalta el borde de la fila con `var(--color-primary)` y aplica el tonal layer correspondiente
- **AND** la UI muestra un chip flotante "Toca para cambiar" en la esquina superior derecha de la fila, posicionado absolute sobre el borde
- **AND** el chip permanece visible durante toda la duración del estado `editing` (no es one-shot por sesión)
- **AND** el navegador dispara un pulso háptico breve si está soportado

#### Scenario: Movimiento durante long-press cancela el gesto

- **WHEN** el alumno mantiene presionada una fila pero mueve el dedo más de 10px antes de cumplirse los 500ms
- **THEN** el long-press se cancela
- **AND** la fila permanece en estado `locked`
- **AND** el scroll natural de la grilla funciona normalmente

#### Scenario: Auto-bloqueo después de 5s sin acción

- **WHEN** la fila está en estado `editing` y pasan 5 segundos sin que el alumno toque ninguna burbuja
- **THEN** la fila vuelve a estado `locked` automáticamente
- **AND** la marca persistida no cambia
- **AND** el resalte visual de edición desaparece
- **AND** el chip "Toca para cambiar" deja de mostrarse

#### Scenario: Solo una fila puede estar en edición a la vez

- **WHEN** la fila 5 está en `editing` y el alumno hace long-press en la fila 7
- **THEN** la fila 5 vuelve a `locked` y su chip se oculta
- **AND** la fila 7 pasa a `editing` y muestra su propio chip
- **AND** el timeout de 5s se reinicia para la fila 7

## REMOVED Requirements

### Requirement: Hint toast "Mantén presionada la fila para cambiar tu respuesta" una vez por sesión

**Reason:** el toast era un mecanismo de descubrimiento one-shot (primera vez por sesión que el alumno tapeaba una fila bloqueada). En el nuevo design system se reemplaza por un chip flotante permanente que aparece sobre la fila cuando entra a estado `editing`. El chip comunica la acción cada vez que el gesto se completa, eliminando la necesidad de un anuncio one-shot que se olvida tras la primera exposición. Sumar chip + toast sería redundancia.

**Migration:** el comportamiento original *"primer tap simple en fila locked dispara un toast informativo"* desaparece. El componente `.hint-toast` del template `simulacro.page.html`, la signal `showHintToast` del view-model, y el flag de sesión `hintShownInSession` se eliminan. Ningún consumidor externo dependía de esto — era 100% UI cosmética. El feature test `simulacro.page.spec.ts` que assertaba sobre `.hint-toast` debe actualizarse para assertar sobre el chip `.row__chip` que aparece dentro de las filas `editing` (cubierto por el scenario modificado *"Long-press en fila bloqueada entra a modo edición con chip permanente"*).
