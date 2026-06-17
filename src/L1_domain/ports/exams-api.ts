import { Exam } from '../entities/exam';
import { ServerTime } from '../value-objects/server-time';
import { SubmissionAck } from '../value-objects/submission-ack';

export interface ExamsListResult {
  exams: readonly Exam[];
  serverTime: ServerTime;
}

// Body del POST de envío. `examId` es el `sessionId` del path; `code` es el
// DNI del alumno (lo resuelve el use case desde IdentityStorage); `responses`
// ya viene con keys `P<n>` y SIN nulls (filtrados en L2); `clientFinishedAt`
// es ISO 8601 anclado al Clock server-anchored.
export interface EnvioRequest {
  examId: string;
  code: string;
  responses: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'>;
  clientFinishedAt: string;
}

// Salida del adapter: el comprobante criptográfico que devuelve el server.
// El use case lo persiste vía `MarkingsStorage.setSubmissionAck` y luego
// limpia las marcaciones. El view-model lo recibe para alimentar el modal
// de comprobante.
export interface EnvioResult {
  ack: SubmissionAck;
}

// Puerto del dominio para el backend de exámenes de learnex.
// Implementación concreta vive en L3 (`HttpExamsApi`).
//
// Mapeo de errores GET /student/exam-sessions:
//   - 401                               → manejado por `credentials.interceptor`
//   - 403                               → ExamsPermissionRevokedError
//   - 404 con code STUDENT_NOT_LINKED   → StudentNotLinkedError
//   - 404 sin code conocido             → NetworkError
//   - 0 / 5xx / 429 / network           → NetworkError
//
// Mapeo de errores POST /student/exam-sessions/{id}/submit (excepción
// documentada a la regla "nunca leer message" — set enumerado cerrado, ver
// design.md D5 de `fase-3-exam-submit-learnex`):
//   - 400                                              → InvalidPayloadError
//   - 403 + message "STUDENT_NOT_ENROLLED"             → StudentNotEnrolledError
//   - 403 + message "STUDENT_MISMATCH" u otro          → NetworkError (genérico)
//   - 404                                              → SimulacroNoAsignadoError
//   - 409 + message "SESSION_NOT_ACTIVE"               → SimulacroCerradoError
//   - 422 + message "CLOCK_SKEW_*"                     → InvalidSubmissionTimeError
//   - 0 / 429 / 5xx / message fuera de enum            → NetworkError
export interface ExamsApi {
  getTodaysExams(): Promise<ExamsListResult>;
  enviar(req: EnvioRequest): Promise<EnvioResult>;
}
