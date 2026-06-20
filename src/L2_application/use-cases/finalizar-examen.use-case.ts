import { FinalizeResult, TutorExamsApi } from '../../L1_domain/ports/tutor-exams-api';

// Finaliza un virtual exam (in_progress → finalized).
// Retorna FinalizeResult con `transitioned: true` (primera finalización) o
// `transitioned: false` (idempotente — ya estaba finalizado, no es un error).
// Online-only (D3): no hay outbox.
export class FinalizarExamenUseCase {
  constructor(private readonly api: TutorExamsApi) {}

  async execute(req: { recordId: string }): Promise<FinalizeResult> {
    return this.api.finalizar(req.recordId);
  }
}
