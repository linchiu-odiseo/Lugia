// Las marcaciones de un examen son un objeto plano: clave = número de
// pregunta como string ("1".."count"), valor = alternativa elegida o null
// para desmarcado. El backend espera este mismo shape en el POST de envío.
export type AlternativaValue = 'A' | 'B' | 'C' | 'D' | 'E' | null;

export type AnswersMap = Record<string, AlternativaValue>;

// Envío encolado cuando el POST al backend falla por red. El cliente
// conserva el `clientSubmittedAt` original (anclado al server-time del
// momento del intento), no la hora del retry.
export interface EnvioPendiente {
  examId: string;
  answers: AnswersMap;
  clientSubmittedAt: string;
}

// Puerto del dominio para persistencia local de marcaciones offline-first.
//
// Las operaciones operan implícitamente sobre el usuario actual: el adapter
// L3 deriva el `userEmail` de la sesión activa (NO se pasa como argumento).
// Esto mantiene las firmas limpias para los use cases.
//
// `wipeUserScope()` borra TODO lo del usuario actual (marcaciones + queue)
// y se invoca en logout ANTES de `identityStorage.clear()` para que el adapter
// todavía pueda leer el email desde `IdentityStorage` internamente.
// El email NO se pasa como argumento — el adapter (L3) lo resuelve vía DI.
// Si no hay identity disponible al momento de `wipeUserScope()` → no-op.
//
// `hasSubmittedAck(examId)` indica si este alumno tiene un envío confirmado
// por el server para ese examen — se usa en el view-model LR para componer
// el card-state "enviado" vs "cerrado" en `serverStatus: 'finalized'`.
// En el cambio `fase-3-exam-list-learnex` la implementación L3 retorna
// siempre `false` porque el POST sigue como stub; en Change 2
// `fase-3-exam-submit-learnex` se cablea contra el ack real.
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
  hasSubmittedAck(examId: string): Promise<boolean>;
  wipeUserScope(): Promise<void>; // sin argumento — el adapter lee IdentityStorage internamente
}
