export class InvalidServerTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidServerTimeError';
  }
}
