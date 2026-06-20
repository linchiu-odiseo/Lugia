// El backend retornó 403 Forbidden para un virtual exam: el tutor no tiene
// permiso para operar este examen (permisos examenes:read o examenes:write_virtual
// revocados, o el examen pertenece a un aula de otro tenant).
// L3 lo emite cuando classifyTutorError recibe status 403.
export class TutorExamForbiddenError extends Error {
  constructor(message = 'No tenés permiso para operar este examen.') {
    super(message);
    this.name = 'TutorExamForbiddenError';
  }
}
