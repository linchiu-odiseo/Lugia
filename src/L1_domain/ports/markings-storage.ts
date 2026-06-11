// Las marcaciones de un simulacro son un objeto plano: clave = número de
// pregunta como string ("1".."count"), valor = alternativa elegida o null
// para desmarcado. El backend espera este mismo shape en el POST de envío.
export type AlternativaValue = 'A' | 'B' | 'C' | 'D' | 'E' | null;

export type AnswersMap = Record<string, AlternativaValue>;

// Envío encolado cuando el POST al backend falla por red. El cliente
// conserva el `clientSubmittedAt` original (anclado al server-time del
// momento del intento), no la hora del retry.
export interface EnvioPendiente {
  simulacroId: string;
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
// y se invoca en logout antes de clear de sesión.
//
// Cualquier operación SHALL rechazar con `OfflineStorageUnavailableError`
// si IndexedDB no está disponible en el browser.
//
// Implementación concreta vive en L3 (`IndexedDbMarkingsStorage`).
export interface MarkingsStorage {
  setMarcacion(simulacroId: string, pregunta: number, alternativa: AlternativaValue): Promise<void>;
  getMarcaciones(simulacroId: string): Promise<AnswersMap>;
  clearMarcaciones(simulacroId: string): Promise<void>;
  enqueueEnvio(envio: EnvioPendiente): Promise<void>;
  getEnviosPendientes(): Promise<EnvioPendiente[]>;
  dequeueEnvio(simulacroId: string): Promise<void>;
  wipeUserScope(): Promise<void>;
}
