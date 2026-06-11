import { Marcacion } from '../../L1_domain/entities/marcacion';
import { Alternativa } from '../../L1_domain/value-objects/alternativa';
import { MarkingsStorage } from '../../L1_domain/ports/markings-storage';

export interface MarcarRespuestaInput {
  simulacroId: string;
  pregunta: number;
  alternativa: Alternativa;
}

// Persiste la marca del alumno en `MarkingsStorage`. La operación NO
// requiere red. El constructor de `Marcacion` valida invariantes y el
// puerto se encarga de scope por usuario internamente.
export class MarcarRespuestaUseCase {
  constructor(private readonly storage: MarkingsStorage) {}

  async execute(input: MarcarRespuestaInput): Promise<void> {
    const marcacion = new Marcacion(input.simulacroId, input.pregunta, input.alternativa);
    await this.storage.setMarcacion(
      marcacion.simulacroId,
      marcacion.pregunta,
      marcacion.alternativa.value,
    );
  }
}
