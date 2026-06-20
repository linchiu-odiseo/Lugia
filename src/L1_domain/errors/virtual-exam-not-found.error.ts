// El backend retornó 404 para un virtual exam: el examen no existe o
// no pertenece a ningún aula que este tutor gestione.
// L3 lo emite cuando classifyTutorError recibe status 404.
export class VirtualExamNotFoundError extends Error {
  constructor(message = 'Este examen ya no está disponible.') {
    super(message);
    this.name = 'VirtualExamNotFoundError';
  }
}
