// El backend rechaza el envío por shape inválido (count no cuadra,
// alternativa fuera de A–E|null, etc.). En un cliente correcto NUNCA
// debería ocurrir — indica un bug del front. La UI muestra un mensaje
// genérico de "error inesperado".
export class InvalidPayloadError extends Error {
  constructor(message = 'El envío contiene datos inválidos.') {
    super(message);
    this.name = 'InvalidPayloadError';
  }
}
