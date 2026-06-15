import { Clock } from '../../L1_domain/ports/clock';
import { MarkingsStorage } from '../../L1_domain/ports/markings-storage';
import { ExamsApi } from '../../L1_domain/ports/exams-api';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { SubmissionNotAvailableError } from '../../L1_domain/errors/submission-not-available.error';

export interface EnviarSimulacroInput {
  examId: string;
  // Override opcional del timestamp. ProgramarAutoEnvioUseCase lo usa para
  // forzar `clientSubmittedAt = exam window end` exacto, independientemente
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
//   `status: "enviado"`. El alumno ve el examen como enviado.
// - `SubmissionNotAvailableError` (POST stub del change actual) propaga
//   sin tocar storage: NO se encola — la guarda explícita en el catch
//   defiende el invariante incluso si alguien cambia la herencia del
//   error. El view-model lo trata como error no recuperable.
// - Cualquier otro error de dominio propaga sin tocar storage.
export class EnviarSimulacroUseCase {
  constructor(
    private readonly api: ExamsApi,
    private readonly storage: MarkingsStorage,
    private readonly clock: Clock,
  ) {}

  async execute(input: EnviarSimulacroInput): Promise<EnviarSimulacroOutput> {
    const ts = input.clientSubmittedAtOverride ?? this.clock.now();
    const clientSubmittedAt = ts.toISOString();
    const answers = await this.storage.getMarcaciones(input.examId);

    try {
      await this.api.enviar({
        examId: input.examId,
        answers,
        clientSubmittedAt,
      });
      await this.storage.clearMarcaciones(input.examId);
      return { status: 'enviado', clientSubmittedAt };
    } catch (err) {
      if (err instanceof NetworkError && !(err instanceof SubmissionNotAvailableError)) {
        await this.storage.enqueueEnvio({
          examId: input.examId,
          answers,
          clientSubmittedAt,
        });
        return { status: 'queued', clientSubmittedAt };
      }
      throw err;
    }
  }
}
