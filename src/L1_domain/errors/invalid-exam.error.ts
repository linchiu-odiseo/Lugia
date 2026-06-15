export class InvalidExamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExamError';
  }
}
