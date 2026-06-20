import { ExamServerStatus } from '../value-objects/exam-server-status';

// Entidad TutorExam — read-model de la lista de virtual exams del tutor.
// Mapeado desde TutorVirtualExamListItemDto en L3.
// El backend incluye classroomId y entryId SOLO en la lista (el detalle no
// los lleva — ver TutorExamDetail). El store los cache aquí para que el
// TutorExamDetailViewModel los resuelva sin llamada extra (D1).
//
// Los helpers de estado usan ExamServerStatus.is() que ya valida el enum.
// NO recomputa el estado: siempre lo recibe del backend.
export class TutorExam {
  public readonly detailId: string;
  public readonly recordId: string;
  public readonly classroomId: string;
  public readonly entryId: string;
  public readonly serverStatus: ExamServerStatus;
  public readonly name: string;
  public readonly courseId: string | null;
  public readonly count: number | null;
  public readonly duration: number;
  public readonly startedAt: Date | null;
  public readonly finishedAt: Date | null;
  public readonly createdAt: Date;

  constructor(params: {
    detailId: string;
    recordId: string;
    classroomId: string;
    entryId: string;
    serverStatus: ExamServerStatus;
    name: string;
    courseId: string | null;
    count: number | null;
    duration: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
  }) {
    this.detailId = params.detailId;
    this.recordId = params.recordId;
    this.classroomId = params.classroomId;
    this.entryId = params.entryId;
    this.serverStatus = params.serverStatus;
    this.name = params.name;
    this.courseId = params.courseId;
    this.count = params.count;
    this.duration = params.duration;
    this.startedAt = params.startedAt;
    this.finishedAt = params.finishedAt;
    this.createdAt = params.createdAt;
  }

  // El tutor puede iniciar el examen solo si está en estado 'scheduled'.
  puedeIniciar(): boolean {
    return this.serverStatus.is('scheduled');
  }

  // El tutor puede finalizar el examen solo si está en progreso.
  puedeFinalizar(): boolean {
    return this.serverStatus.is('in_progress');
  }

  // El examen ya fue finalizado (read-only para el tutor — D5).
  estaFinalizado(): boolean {
    return this.serverStatus.is('finalized') || this.serverStatus.esTerminal();
  }
}
