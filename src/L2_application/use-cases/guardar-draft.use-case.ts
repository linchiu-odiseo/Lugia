// Use case puro para auto-save. NO toca queue, NO persiste ack, NO borra
// marcaciones. Errores se propagan; el `DraftAutoSaveDispatcher` los clasifica
// para decidir cuál escala al view-model.
//
// Resuelve el snapshot actual de marcaciones → reshape → delega al port
// ExamsApi.guardarDraft (POST /draft, 204 No Content).
import { IdentityStorage } from '../../L1_domain/ports/identity-storage';
import { AnswersMap, MarkingsStorage } from '../../L1_domain/ports/markings-storage';
import { DraftRequest, ExamsApi } from '../../L1_domain/ports/exams-api';
import { SessionExpiredError } from '../../L1_domain/errors/session-expired.error';

export class GuardarDraftUseCase {
  constructor(
    private readonly api: ExamsApi,
    private readonly markingsStorage: MarkingsStorage,
    private readonly identityStorage: IdentityStorage,
  ) {}

  async execute({ examId }: { examId: string }): Promise<void> {
    const identity = await this.identityStorage.read();
    // Defensivo: identity nula (sesión expirada) o sin codigo (tutor stub que
    // no debería llegar acá) → no tocamos storage ni api.
    if (identity === null || identity.codigo === null) {
      throw new SessionExpiredError();
    }
    const code = identity.codigo;

    const answers = await this.markingsStorage.getMarcaciones(examId);
    const responses = this.toResponses(answers);

    const req: DraftRequest = { examId, code, responses };
    await this.api.guardarDraft(req);
  }

  // Reshape de AnswersMap interno a `responses` del contrato learnex:
  // - Omite las preguntas con valor `null` (el back solo quiere las marcadas).
  // - Prefija las keys con "P" (`"1"` → `"P1"`).
  // Lógica idéntica a `responsesFromAnswers` de EnviarSimulacroUseCase.
  private toResponses(answers: AnswersMap): Record<string, 'A' | 'B' | 'C' | 'D' | 'E'> {
    const out: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'> = {};
    for (const [pregunta, letra] of Object.entries(answers)) {
      if (letra === null) continue;
      out[`P${pregunta}`] = letra;
    }
    return out;
  }
}
