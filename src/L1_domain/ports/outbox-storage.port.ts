// Puerto del dominio para la cola de envíos pendientes (outbox offline).
// Se invoca en logout para descartar toda la cola pendiente del usuario.
// Implementación concreta: parte de `IndexedDbMarkingsStorage` en L3
// (el adapter implementa ambas interfaces: MarkingsStorage y OutboxStoragePort).
export interface OutboxStoragePort {
  clear(): Promise<void>;
}
