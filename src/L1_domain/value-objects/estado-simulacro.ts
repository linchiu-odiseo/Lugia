import { InvalidSimulacroError } from '../errors/invalid-simulacro.error';

export type EstadoValue = 'pendiente' | 'abierto' | 'enviado' | 'cerrado';

const VALID: ReadonlySet<EstadoValue> = new Set<EstadoValue>([
  'pendiente',
  'abierto',
  'enviado',
  'cerrado',
]);

// 4 estados derivados por backend en cada GET (no almacenados como columna).
// Cliente NO recomputa por su cuenta: siempre los recibe del backend.
export class EstadoSimulacro {
  public readonly value: EstadoValue;

  constructor(raw: string) {
    if (!VALID.has(raw as EstadoValue)) {
      throw new InvalidSimulacroError(
        `Estado de simulacro inválido: "${raw}". Debe ser pendiente, abierto, enviado o cerrado.`,
      );
    }
    this.value = raw as EstadoValue;
  }

  is(other: EstadoValue): boolean {
    return this.value === other;
  }

  esTerminal(): boolean {
    return this.value === 'enviado' || this.value === 'cerrado';
  }

  permiteEntrada(): boolean {
    return this.value === 'abierto';
  }
}
