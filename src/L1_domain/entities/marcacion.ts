import { Alternativa } from '../value-objects/alternativa';
import { InvalidMarcacionError } from '../errors/invalid-marcacion.error';

// Entidad Marcacion: representa una respuesta del alumno a una pregunta
// específica de un simulacro. La identidad es (simulacroId, pregunta);
// la alternativa puede cambiar (incluso a null = desmarcado).
export class Marcacion {
  public readonly simulacroId: string;
  public readonly pregunta: number;
  public readonly alternativa: Alternativa;

  constructor(simulacroId: string, pregunta: number, alternativa: Alternativa) {
    const id = (simulacroId ?? '').trim();
    if (id.length === 0) {
      throw new InvalidMarcacionError('Marcacion requiere un simulacroId no vacío.');
    }
    if (!Number.isInteger(pregunta) || pregunta <= 0) {
      throw new InvalidMarcacionError(
        `Marcacion pregunta debe ser entero positivo. Recibido: ${pregunta}.`,
      );
    }
    if (!(alternativa instanceof Alternativa)) {
      throw new InvalidMarcacionError('Marcacion requiere una Alternativa válida.');
    }
    this.simulacroId = id;
    this.pregunta = pregunta;
    this.alternativa = alternativa;
  }
}
