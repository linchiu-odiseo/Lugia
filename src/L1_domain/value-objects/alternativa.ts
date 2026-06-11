import { AlternativaValue } from '../ports/markings-storage';
import { InvalidAlternativaError } from '../errors/invalid-alternativa.error';

const VALID_LETTERS: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D', 'E']);

// Value-object rico del dominio para una alternativa A–E o null (desmarcado).
// La capa de persistencia (puerto MarkingsStorage) usa el tipo plano
// `AlternativaValue` para no acoplar serialización a la lógica del dominio;
// el use case convierte uno al otro vía `.value`.
export class Alternativa {
  public readonly value: AlternativaValue;

  private constructor(value: AlternativaValue) {
    this.value = value;
  }

  static fromString(raw: string | null | undefined): Alternativa {
    if (raw === null || raw === undefined) {
      return new Alternativa(null);
    }
    if (!VALID_LETTERS.has(raw)) {
      throw new InvalidAlternativaError(
        `Alternativa inválida: "${raw}". Debe ser A, B, C, D, E o null.`,
      );
    }
    return new Alternativa(raw as AlternativaValue);
  }

  static desmarcada(): Alternativa {
    return new Alternativa(null);
  }

  isMarked(): boolean {
    return this.value !== null;
  }

  equals(other: Alternativa): boolean {
    return this.value === other.value;
  }
}
