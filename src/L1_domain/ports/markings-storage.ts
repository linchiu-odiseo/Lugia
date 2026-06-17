import { SubmissionAck } from '../value-objects/submission-ack';

// Las marcaciones de un examen son un objeto plano: clave = número de
// pregunta como string ("1".."count"), valor = alternativa elegida o null
// para desmarcado. El use case reshape esto a `responses: { P<n>: letra }`
// con prefijo P y omitiendo las nulls antes de enviar.
export type AlternativaValue = 'A' | 'B' | 'C' | 'D' | 'E' | null;

export type AnswersMap = Record<string, AlternativaValue>;

// Envío encolado cuando el POST al backend falla por red. El cliente
// conserva el `clientFinishedAt` original (anclado al server-time del
// momento del intento), no la hora del retry. También conserva el `code`
// (DNI) — el dispatcher reconstruye el body sin re-consultar IdentityStorage
// porque entre encolado y retry el alumno podría haber hecho logout/login
// (caso patológico, pero la defensa es trivial).
export interface EnvioPendiente {
  examId: string;
  code: string;
  answers: AnswersMap;
  clientFinishedAt: string;
}

// Puerto del dominio para persistencia local de marcaciones offline-first.
//
// Las operaciones operan implícitamente sobre el usuario actual: el adapter
// L3 deriva el `userEmail` de la sesión activa (NO se pasa como argumento).
// Esto mantiene las firmas limpias para los use cases.
//
// `wipeUserScope()` borra TODO lo del usuario actual (marcaciones + queue
// + acks) y se invoca en logout ANTES de `identityStorage.clear()` para
// que el adapter todavía pueda leer el email desde `IdentityStorage`
// internamente. Si no hay identity disponible → no-op.
//
// `setSubmissionAck` / `getSubmissionAck` persisten el comprobante
// criptográfico devuelto por el server. La presencia del ack es la señal
// "yo envié este examen" que alimenta el card-state `enviado` en /home y
// la posibilidad de mostrar el modal de comprobante.
//
// Cualquier operación SHALL rechazar con `OfflineStorageUnavailableError`
// si IndexedDB no está disponible en el browser.
//
// Implementación concreta vive en L3 (`IndexedDbMarkingsStorage`).
export interface MarkingsStorage {
  setMarcacion(examId: string, pregunta: number, alternativa: AlternativaValue): Promise<void>;
  getMarcaciones(examId: string): Promise<AnswersMap>;
  clearMarcaciones(examId: string): Promise<void>;
  enqueueEnvio(envio: EnvioPendiente): Promise<void>;
  getEnviosPendientes(): Promise<EnvioPendiente[]>;
  dequeueEnvio(examId: string): Promise<void>;
  setSubmissionAck(examId: string, ack: SubmissionAck): Promise<void>;
  getSubmissionAck(examId: string): Promise<SubmissionAck | null>;
  wipeUserScope(): Promise<void>; // sin argumento — el adapter lee IdentityStorage internamente
}
