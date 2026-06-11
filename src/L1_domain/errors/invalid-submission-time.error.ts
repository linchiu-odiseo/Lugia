// El backend rechaza el envío porque el `clientSubmittedAt` no cae dentro
// de `[inicio, fin]` del simulacro. Indica que el cliente mintió el
// timestamp o que el envío llegó demasiado fuera de banda.
export class InvalidSubmissionTimeError extends Error {
  constructor(message = 'El tiempo de envío no es válido para este simulacro.') {
    super(message);
    this.name = 'InvalidSubmissionTimeError';
  }
}
