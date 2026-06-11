export class InvalidCredentialsError extends Error {
  constructor(message = 'Credenciales inválidas.') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}
