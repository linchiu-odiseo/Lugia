import { TutorExamDetail } from '../../L1_domain/value-objects/tutor-exam-detail';
import { TutorExamsApi } from '../../L1_domain/ports/tutor-exams-api';

// Lee el detalle de un virtual exam por recordId.
// `recordId` es el identificador que usa el backend en todos los endpoints
// de gestión (start/finalize/enabled-students).
// Online-only (D3): no hay caché local.
export class GetTutorExamDetailUseCase {
  constructor(private readonly api: TutorExamsApi) {}

  async execute(req: { recordId: string }): Promise<TutorExamDetail> {
    return this.api.getExamDetail(req.recordId);
  }
}
