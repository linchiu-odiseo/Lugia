import { environment } from '../../environments/environment';

// Único punto de interpolación del tenant slug en URLs de learnex.
// La regla: ningún adapter L3 concatena `/t/<slug>/...` directamente — todo
// pasa por este helper. Cambiar `TENANT_SLUG` en `.env` cambia todas las
// URLs sin tocar código fuente.
//
// Las rutas siguen el contrato de learnex (.authentic/pwa-auth-contract.md
// y .authentic/contrato-pwa-submit.md):
//   POST /t/{slug}/auth/login
//   POST /t/{slug}/auth/refresh
//   POST /t/{slug}/auth/logout
//   GET  /t/{slug}/auth/me
//   GET  /t/{slug}/{role}/me
//   GET  /t/{slug}/student/exam-sessions
//   POST /t/{slug}/student/exam-sessions/{sessionId}/submit
//   POST /t/{slug}/student/exam-sessions/{sessionId}/draft
function base(): string {
  return `${environment.apiBaseUrl}/t/${environment.tenantSlug}`;
}

export const apiPath = {
  login: (): string => `${base()}/auth/login`,
  refresh: (): string => `${base()}/auth/refresh`,
  logout: (): string => `${base()}/auth/logout`,
  me: (): string => `${base()}/auth/me`,
  profile: (role: 'student' | 'tutor'): string => `${base()}/${role}/me`,
  studentExamSessions: (): string => `${base()}/student/exam-sessions`,
  // `sessionId` viene del `Exam.id` (confirmado por back en handoff de
  // `fase-3-exam-submit-learnex`: el `id` del GET de sesiones ES el
  // sessionId del POST). encodeURIComponent es defensa básica — el
  // contrato lo define como UUID v4, pero no asumimos sanitización.
  studentExamSubmit: (sessionId: string): string =>
    `${base()}/student/exam-sessions/${encodeURIComponent(sessionId)}/submit`,
  // Auto-save progresivo (draft-auto-save). Mismo patrón que studentExamSubmit.
  // El endpoint recibe 204 No Content; sin body de respuesta.
  studentExamDraft: (sessionId: string): string =>
    `${base()}/student/exam-sessions/${encodeURIComponent(sessionId)}/draft`,
};
