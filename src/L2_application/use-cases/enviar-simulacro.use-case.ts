import { Clock } from '../../L1_domain/ports/clock';
import { MarkingsStorage } from '../../L1_domain/ports/markings-storage';
import { SimulacrosApi } from '../../L1_domain/ports/simulacros-api';
import { NetworkError } from '../../L1_domain/errors/network.error';

export interface EnviarSimulacroInput {
  simulacroId: string;
  // Override opcional del timestamp. ProgramarAutoEnvioUseCase lo usa para
  // forzar `clientSubmittedAt = simulacro.fin` exacto, independientemente
  // de cuándo el timer dispare por el jitter. Caso normal (botón Enviar):
  // se omite y el clock server-anchored manda.
  clientSubmittedAtOverride?: Date;
}

export interface EnviarSimulacroOutput {
  status: 'enviado' | 'queued';
  clientSubmittedAt: string;
}

// Envía las marcaciones al backend. Decisión deliberada de UX:
// - Si el POST falla por NetworkError → encola en MarkingsStorage con el
//   `clientSubmittedAt` original capturado al momento del intento, y
//   retorna `status: "queued"`. El alumno ve "Pendiente de envío…".
// - Si responde 200/409 → borra las marcaciones locales y retorna
//   `status: "enviado"`. El alumno ve el simulacro como enviado.
// - Cualquier otro error de dominio (`SimulacroCerradoError`, etc.) propaga
//   sin tocar storage — el caller decide cómo mostrarlo y navegar.
export class EnviarSimulacroUseCase {
  constructor(
    private readonly api: SimulacrosApi,
    private readonly storage: MarkingsStorage,
    private readonly clock: Clock,
  ) {}

  async execute(input: EnviarSimulacroInput): Promise<EnviarSimulacroOutput> {
    const ts = input.clientSubmittedAtOverride ?? this.clock.now();
    const clientSubmittedAt = ts.toISOString();
    const answers = await this.storage.getMarcaciones(input.simulacroId);

    try {
      await this.api.enviar({
        simulacroId: input.simulacroId,
        answers,
        clientSubmittedAt,
      });
      await this.storage.clearMarcaciones(input.simulacroId);
      return { status: 'enviado', clientSubmittedAt };
    } catch (err) {
      if (err instanceof NetworkError) {
        await this.storage.enqueueEnvio({
          simulacroId: input.simulacroId,
          answers,
          clientSubmittedAt,
        });
        return { status: 'queued', clientSubmittedAt };
      }
      throw err;
    }
  }
}
