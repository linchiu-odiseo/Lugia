export class InvalidMarcacionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMarcacionError';
  }
}
