import { TutorExam } from '../../L1_domain/entities/tutor-exam';
import { TutorExamsApi } from '../../L1_domain/ports/tutor-exams-api';

// Lee la lista de virtual exams del tutor desde learnex.
// Online-only (D3): no hay outbox, no hay IDB. Si la red falla, el error
// se propaga tal cual al caller (view-model o store).
export class GetTutorExamsUseCase {
  constructor(private readonly api: TutorExamsApi) {}

  async execute(): Promise<readonly TutorExam[]> {
    return this.api.getTutorExams();
  }
}
