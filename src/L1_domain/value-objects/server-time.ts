import { InvalidServerTimeError } from '../errors/invalid-server-time.error';

// Value-object para el timestamp que el backend envía en cada GET /simulacros.
// Solo acepta cadenas ISO8601 que `new Date(...)` pueda parsear sin NaN.
// Una vez construido, expone el `Date` resuelto.
export class ServerTime {
  public readonly value: Date;

  constructor(raw: string) {
    const trimmed = (raw ?? '').trim();
    if (trimmed.length === 0) {
      throw new InvalidServerTimeError('ServerTime no puede estar vacío.');
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new InvalidServerTimeError(
        `ServerTime no es un ISO8601 válido: "${trimmed}".`,
      );
    }
    this.value = parsed;
  }

  toMillis(): number {
    return this.value.getTime();
  }
}
