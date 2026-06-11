export class InvalidAlternativaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAlternativaError';
  }
}
