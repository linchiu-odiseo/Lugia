// El adapter L3 lanza este error cuando el back responde 403 al POST de envío
// con `body.message === "STUDENT_NOT_ENROLLED"`. Significa que el alumno
// autenticado no está inscripto en el aula de la sesión que intenta enviar.
//
// UX: el view-model muestra copy "No estás inscripto en este examen" y
// redirige a /home. Es una situación accionable — el alumno entiende que
// tiene que hablar con su tutor.
export class StudentNotEnrolledError extends Error {
  constructor(message = 'El alumno no está inscripto en el aula de esta sesión.') {
    super(message);
    this.name = 'StudentNotEnrolledError';
  }
}
