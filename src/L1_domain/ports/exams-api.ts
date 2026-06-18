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

// Body del POST de draft (auto-save progresivo). `examId` es el `sessionId`
// del path (igual que en EnvioRequest); `code` es el DNI del alumno; `responses`
// ya viene con keys `P<n>` y SIN nulls (filtrados en L2).
// NOTA: NO incluye `clientFinishedAt` — exclusivo del /submit final. El draft
// es snapshot completo del estado actual; el server usa `expectedEndAt` para TTL.
export interface DraftRequest {
  examId: string;
  code: string;
  responses: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'>;
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
//
// Mapeo de errores POST /student/exam-sessions/{id}/draft (excepción
// documentada a la regla "nunca leer message" — segundo set enumerado cerrado,
// ver design.md D5/D10 de `draft-auto-save`; misma justificación que submit):
// Set DRAFT_ERROR_MESSAGES = { 'STUDENT_NOT_ENROLLED', 'STUDENT_MISMATCH',
//   'SESSION_NOT_FOUND', 'STUDENT_BY_CODE_NOT_FOUND', 'SESSION_NOT_ACTIVE' }
//   - 400                                                → InvalidPayloadError
//   - 401                                                → manejado por `credentials.interceptor`
//   - 403 + message "STUDENT_NOT_ENROLLED"               → StudentNotEnrolledError
//   - 403 + message "STUDENT_MISMATCH" u otro            → NetworkError (retryable con backoff)
//   - 404 + message "SESSION_NOT_FOUND"                  → SimulacroNoAsignadoError
//   - 404 + message "STUDENT_BY_CODE_NOT_FOUND"          → StudentNotLinkedError
//   - 404 sin message conocido                           → NetworkError (retryable con backoff;
//       autoheal si el back deploya mid-sesión — ver design.md D6)
//   - 409 + message "SESSION_NOT_ACTIVE"                 → SimulacroCerradoError (escala al VM)
//   - 429 / 5xx / 0 / timeout / message fuera de enum   → NetworkError (retryable con backoff)
export interface ExamsApi {
  getTodaysExams(): Promise<ExamsListResult>;
  enviar(req: EnvioRequest): Promise<EnvioResult>;
  guardarDraft(req: DraftRequest): Promise<void>; // 204 No Content
}
