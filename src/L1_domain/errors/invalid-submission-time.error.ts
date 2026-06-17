// El backend rechaza el envío porque el `clientFinishedAt` no cae dentro
// de la ventana vigente del examen (antes de `started` o más de 5 min en
// el futuro del server time). Cubre 422 CLOCK_SKEW_BEFORE_START y
// CLOCK_SKEW_TOO_FAR_FUTURE — UX común: "Tu reloj está desincronizado".
export class InvalidSubmissionTimeError extends Error {
  constructor(message = 'El tiempo de envío no es válido para este simulacro.') {
    super(message);
    this.name = 'InvalidSubmissionTimeError';
  }
}
