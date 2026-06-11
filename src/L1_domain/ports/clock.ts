import { ServerTime } from '../value-objects/server-time';

// Puerto del dominio para "hora actual de la aplicación", anclada al backend.
//
// La PWA NUNCA usa Date.now() / new Date() directamente para decisiones de
// negocio. Cualquier read de tiempo pasa por `now()`, que aplica el offset
// capturado por el último `setServerTime(...)` proveniente de un GET al
// backend. Esto bloquea el ataque "el alumno cambia la hora del celular".
//
// Implementación concreta vive en L3 (`ServerAnchoredClock`).
export interface Clock {
  now(): Date;
  setServerTime(serverTime: ServerTime): void;
}
