// El backend learnex retornó 404 + `code: "STUDENT_NOT_LINKED"` — el
// usuario logueado no tiene un Student asociado en learnex. El view-model
// LR muestra una pantalla específica con copy
// "Tu cuenta no tiene un alumno asociado, contacta al tutor".
export class StudentNotLinkedError extends Error {
  constructor(message = 'El usuario no tiene un alumno asociado.') {
    super(message);
    this.name = 'StudentNotLinkedError';
  }
}
