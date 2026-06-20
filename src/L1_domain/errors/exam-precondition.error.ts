// El backend retornó 422 Unprocessable Entity para un virtual exam: una
// precondición no se cumplió (0 alumnos habilitados, claves no configuradas,
// o se intenta finalizar un examen que aún no fue iniciado).
// L3 lo emite cuando classifyTutorError recibe status 422.
export class ExamPreconditionError extends Error {
  constructor(message = 'No se cumple una precondición para esta operación.') {
    super(message);
    this.name = 'ExamPreconditionError';
  }
}
