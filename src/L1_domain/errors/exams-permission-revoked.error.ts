// El backend learnex retornó 403 al pedir la lista de exámenes — el
// alumno perdió el permiso `student:exams:view`. El view-model LR
// limpia la sesión y redirige a /login.
export class ExamsPermissionRevokedError extends Error {
  constructor(message = 'Permisos de exámenes revocados.') {
    super(message);
    this.name = 'ExamsPermissionRevokedError';
  }
}
