// Puerto del dominio para enviar mensajes al Service Worker.
// Opcional: si no se provee (undefined), los pasos que lo usan son no-op.
// Implementación concreta en L3 (wrapea `SwPush` o postMessage al SW).
export interface SwMessengerPort {
  post(message: { type: string }): void;
}
