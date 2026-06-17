// Comprobante criptográfico devuelto por learnex tras un envío exitoso del
// alumno. Es la autoridad de "yo envié": persistido en IDB, recuperable tras
// reinicios, mostrable como recibo en el modal de éxito.
//
// El `submissionHash` es sha256 server-side; el cliente NUNCA lo recalcula.
// Si el alumno hace dos envíos con respuestas distintas, el segundo retorna
// el hash del PRIMER envío (idempotencia first-wins del back) — el hash
// guardado es lo que el server tiene, no lo que el alumno mandó por última
// vez. Esa semántica está en design.md D14.
const HEX_64_RE = /^[0-9a-f]{64}$/;

export class SubmissionAck {
  constructor(
    readonly id: string,
    readonly submissionHash: string,
    readonly submittedAt: Date,
  ) {
    if (id.trim().length === 0) {
      throw new Error('SubmissionAck requiere un id no vacío.');
    }
    if (!HEX_64_RE.test(submissionHash)) {
      throw new Error(
        `SubmissionAck.submissionHash debe ser 64 chars hex; recibido longitud ${submissionHash.length}.`,
      );
    }
    if (!(submittedAt instanceof Date) || Number.isNaN(submittedAt.getTime())) {
      throw new Error('SubmissionAck.submittedAt debe ser un Date válido.');
    }
  }
}
