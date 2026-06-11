import { InvalidSessionError } from '../errors/invalid-session.error';

export class BearerToken {
  public readonly value: string;

  constructor(raw: string) {
    const trimmed = (raw ?? '').trim();
    if (trimmed.length === 0) {
      throw new InvalidSessionError('BearerToken no puede estar vacío.');
    }
    this.value = trimmed;
  }

  toString(): string {
    return this.value;
  }
}
