import { Clock } from '../../L1_domain/ports/clock';
import { Exam } from '../../L1_domain/entities/exam';
import { EnviarSimulacroOutput, EnviarSimulacroUseCase } from './enviar-simulacro.use-case';

// Jitter máximo en ms a sumar/restar del `setTimeout` para evitar
// thundering herd cuando 20k alumnos auto-envían al mismo segundo.
// El `clientSubmittedAt` que se envía al backend SIEMPRE es exactamente
// el cierre de ventana (started + duration*1000, o scheduled+duration*1000
// como fallback), NO el momento en que el timer dispara — así dos disparos
// a 9:00:02 vs 9:00:00 quedan ambos registrados como envío a las 9:00:00.
const JITTER_MAX_MS = 3000;

export interface ProgramarAutoEnvioInput {
  exam: Exam;
  onResult?: (result: EnviarSimulacroOutput) => void;
  onError?: (err: unknown) => void;
}

export interface AutoEnvioHandle {
  cancel(): void;
}

// Programa el envío automático del examen para cuando el reloj
// server-anchored cruce el cierre de la ventana. El caller (view-model)
// cancela el handle si el alumno envía manualmente antes.
//
// Cálculo del cierre: `(started ?? scheduled).getTime() + duration * 1000`.
// El factor es ×1000 porque `duration` viene de learnex en SEGUNDOS.
export class ProgramarAutoEnvioUseCase {
  constructor(
    private readonly enviar: EnviarSimulacroUseCase,
    private readonly clock: Clock,
  ) {}

  execute(input: ProgramarAutoEnvioInput): AutoEnvioHandle {
    const ahoraMs = this.clock.now().getTime();
    const anchor = input.exam.started ?? input.exam.scheduled;
    const finMs = anchor.getTime() + input.exam.duration * 1000;
    const finDate = new Date(finMs);
    const jitter = (Math.random() * 2 - 1) * JITTER_MAX_MS;
    const delay = Math.max(0, finMs - ahoraMs + jitter);

    const timeout = setTimeout(async () => {
      try {
        const result = await this.enviar.execute({
          examId: input.exam.id,
          clientSubmittedAtOverride: finDate,
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
