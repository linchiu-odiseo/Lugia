import { Exam } from '../entities/exam';
import { ServerTime } from '../value-objects/server-time';
import { AnswersMap } from './markings-storage';

export interface ExamsListResult {
  exams: readonly Exam[];
  serverTime: ServerTime;
}

export interface EnvioRequest {
  examId: string;
  answers: AnswersMap;
  clientSubmittedAt: string;
}

export interface EnvioResult {
  status: 'enviado';
  clientSubmittedAt: string;
  serverReceivedAt: string;
}

// Puerto del dominio para el backend de exámenes de learnex.
// Implementación concreta vive en L3 (`HttpExamsApi`).
//
// Mapeo de errores por `(status, endpoint, body.code)`:
//   - 401 cualquier endpoint            → manejado por `credentials.interceptor`
//   - 403                               → ExamsPermissionRevokedError
//   - 404 con code STUDENT_NOT_LINKED   → StudentNotLinkedError
//   - 404 sin code conocido             → NetworkError
//   - 0 / 5xx / 429 / network           → NetworkError
//   - POST envío                        → SubmissionNotAvailableError (stub en este change;
//                                          Change 2 `fase-3-exam-submit-learnex` reemplaza)
export interface ExamsApi {
  getTodaysExams(): Promise<ExamsListResult>;
  enviar(req: EnvioRequest): Promise<EnvioResult>;
}
