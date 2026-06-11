import { Injectable, OnDestroy, inject } from '@angular/core';
import { Connectivity, ConnectivityUnsubscribe } from '../../L1_domain/ports/connectivity';
import { CONNECTIVITY } from '../../app.config';
import { RetomarEnviosPendientesUseCase } from '../../L2_application/use-cases/retomar-envios-pendientes.use-case';

// Servicio L3 que escucha el puerto `Connectivity` y dispara
// `RetomarEnviosPendientesUseCase` cada vez que la red vuelve.
//
// `start()` se invoca una vez al bootstrap de la app vía APP_INITIALIZER.
// Si arranca con red disponible, dispara un retry inmediato. Después se
// queda suscrito a los eventos de Connectivity para futuros retries
// automáticos. `ngOnDestroy` cancela la suscripción.
//
// Decisión: errores del use case se silencian con `.catch(() => {})`
// porque el RetomarEnviosPendientesUseCase ya logueó internamente lo que
// se descartó; el dispatcher no debe romper el bootstrap si algo falla.
@Injectable({ providedIn: 'root' })
export class EnvioRetryDispatcher implements OnDestroy {
  private readonly connectivity = inject<Connectivity>(CONNECTIVITY);
  private readonly retomar = inject(RetomarEnviosPendientesUseCase);
  private unsubscribe: ConnectivityUnsubscribe | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    if (this.connectivity.current()) {
      void this.retomar.execute().catch(() => undefined);
    }

    this.unsubscribe = this.connectivity.subscribe((isOnline) => {
      if (isOnline) {
        void this.retomar.execute().catch(() => undefined);
      }
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
  }
}
