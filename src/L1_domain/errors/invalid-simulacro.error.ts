export class InvalidSimulacroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSimulacroError';
  }
}
