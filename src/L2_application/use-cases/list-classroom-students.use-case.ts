import { ClassroomStudent } from '../../L1_domain/value-objects/classroom-student';
import { TutorExamsApi } from '../../L1_domain/ports/tutor-exams-api';

// Lee la lista de alumnos del aula para un virtual exam.
// `classroomId` viene del TutorExam (lista); `virtualExamDetailId` es el
// detailId interno (dto.id de la lista/detalle), NO el recordId.
// Online-only (D3): no hay caché local.
export class ListClassroomStudentsUseCase {
  constructor(private readonly api: TutorExamsApi) {}

  async execute(req: {
    classroomId: string;
    virtualExamDetailId: string;
  }): Promise<readonly ClassroomStudent[]> {
    return this.api.listClassroomStudents(req);
  }
}
