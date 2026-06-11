import { Clock } from '../../L1_domain/ports/clock';
import { Simulacro } from '../../L1_domain/entities/simulacro';
import { EnviarSimulacroOutput, EnviarSimulacroUseCase } from './enviar-simulacro.use-case';

// Jitter máximo en ms a sumar/restar del `setTimeout` para evitar
// thundering herd cuando 20k alumnos auto-envían al mismo segundo.
// El `clientSubmittedAt` que se envía al backend SIEMPRE es exactamente
// `simulacro.fin`, NO el momento en que el timer dispara — así dos
// disparos a 9:00:02 vs 9:00:00 quedan ambos registrados como envío
// a las 9:00:00.
const JITTER_MAX_MS = 3000;

export interface ProgramarAutoEnvioInput {
  simulacro: Simulacro;
  onResult?: (result: EnviarSimulacroOutput) => void;
  onError?: (err: unknown) => void;
}

export interface AutoEnvioHandle {
  cancel(): void;
}

// Programa el envío automático del simulacro para cuando el reloj
// server-anchored cruce `simulacro.fin`. El caller (view-model) cancela
// el handle si el alumno envía manualmente antes.
export class ProgramarAutoEnvioUseCase {
  constructor(
    private readonly enviar: EnviarSimulacroUseCase,
    private readonly clock: Clock,
  ) {}

  execute(input: ProgramarAutoEnvioInput): AutoEnvioHandle {
    const ahoraMs = this.clock.now().getTime();
    const finMs = input.simulacro.fin.getTime();
    const jitter = (Math.random() * 2 - 1) * JITTER_MAX_MS;
    const delay = Math.max(0, finMs - ahoraMs + jitter);

    const timeout = setTimeout(async () => {
      try {
        const result = await this.enviar.execute({
          simulacroId: input.simulacro.id,
          clientSubmittedAtOverride: input.simulacro.fin,
        });
        input.onResult?.(result);
      } catch (err) {
        input.onError?.(err);
      }
    }, delay);

    return {
      cancel: () => clearTimeout(timeout),
    };
  }
}
