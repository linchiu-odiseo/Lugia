import { InvalidExamError } from '../errors/invalid-exam.error';

export type ExamServerStatusValue = 'scheduled' | 'in_progress' | 'finalized';

const VALID: ReadonlySet<ExamServerStatusValue> = new Set<ExamServerStatusValue>([
  'scheduled',
  'in_progress',
  'finalized',
]);

// 3 estados que learnex deriva por sesión de examen. El cliente NUNCA
// recomputa por su cuenta: siempre los recibe del backend. El estado
// "enviado" desde la perspectiva del alumno se compone en el view-model
// con `serverStatus + hasSubmittedAck(examId)` — NO vive en este VO.
export class ExamServerStatus {
  public readonly value: ExamServerStatusValue;

  constructor(raw: string) {
    if (!VALID.has(raw as ExamServerStatusValue)) {
      throw new InvalidExamError(
        `Exam serverStatus inválido: "${raw}". Debe ser scheduled, in_progress o finalized.`,
      );
    }
    this.value = raw as ExamServerStatusValue;
  }

  is(other: ExamServerStatusValue): boolean {
    return this.value === other;
  }

  esTerminal(): boolean {
    return this.value === 'finalized';
  }

  permiteEntrada(): boolean {
    return this.value === 'in_progress';
  }
}
