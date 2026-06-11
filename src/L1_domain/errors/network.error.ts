export class NetworkError extends Error {
  constructor(message = 'No se pudo conectar al servidor. Inténtalo de nuevo.') {
    super(message);
    this.name = 'NetworkError';
  }
}
