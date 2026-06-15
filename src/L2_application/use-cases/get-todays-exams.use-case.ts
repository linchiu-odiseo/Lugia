import { Clock } from '../../L1_domain/ports/clock';
import { Exam } from '../../L1_domain/entities/exam';
import { ExamsApi } from '../../L1_domain/ports/exams-api';

// Lee la lista de exámenes del día desde learnex y, como side-effect,
// ancla el `Clock` con el `serverTime` reportado. Los countdowns de la UI
// pasan automáticamente a estar anclados al servidor desde el primer GET.
export class GetTodaysExamsUseCase {
  constructor(
    private readonly api: ExamsApi,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly Exam[]> {
    const result = await this.api.getTodaysExams();
    this.clock.setServerTime(result.serverTime);
    return result.exams;
  }
}
