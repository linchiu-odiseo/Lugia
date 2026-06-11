export class InvalidSessionError extends Error {
  constructor(message = 'Sesión inválida.') {
    super(message);
    this.name = 'InvalidSessionError';
  }
}
