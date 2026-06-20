import { ExamServerStatus } from './exam-server-status';

// Detalle de un virtual exam para la pantalla de gestión del tutor.
// El backend (GET /virtual-exams/:recordId) devuelve este shape — NOTA:
// NO incluye `classroomId` ni `entryId` (solo la lista los lleva).
// El `id` es el detailId interno del backend; `recordId` es el id que
// usan todos los demás endpoints (start/finalize/enabled-students).
// `enabledStudentIds` es la lista de studentIds habilitados para rendir.
// `courseId` y `count` pueden ser null (examen sin curso atado, o aún
// no inicializado).
export interface TutorExamDetail {
  readonly id: string;            // detailId interno
  readonly recordId: string;      // id usado por endpoints de gestión
  readonly status: ExamServerStatus;
  readonly name: string;
  readonly courseId: string | null;
  readonly count: number | null;
  readonly duration: number;      // segundos
  readonly enabledStudentIds: readonly string[];
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
}
