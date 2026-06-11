import { Injectable } from '@angular/core';
import { Clock } from '../../L1_domain/ports/clock';
import { ServerTime } from '../../L1_domain/value-objects/server-time';

// Adapter L3 del puerto Clock.
//
// Mantiene un `offsetMs = serverTime - clientTime` capturado en la última
// llamada a `setServerTime(...)`. `now()` devuelve `new Date(Date.now() + offsetMs)`.
// Antes de la primera captura el offset es 0 → comportamiento idéntico al reloj
// local. Esto es deliberado: durante login/bootstrap (antes del primer GET)
// no hay autoridad de tiempo todavía, y el comportamiento local es la mejor
// aproximación disponible.
@Injectable({ providedIn: 'root' })
export class ServerAnchoredClock implements Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  setServerTime(serverTime: ServerTime): void {
    this.offsetMs = serverTime.toMillis() - Date.now();
  }
}
