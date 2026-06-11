import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { EnvioRetryDispatcher } from '../../../../src/L3_periphery/envio/envio-retry-dispatcher.service';
import { RetomarEnviosPendientesUseCase } from '../../../../src/L2_application/use-cases/retomar-envios-pendientes.use-case';
import {
  Connectivity,
  ConnectivityUnsubscribe,
} from '../../../../src/L1_domain/ports/connectivity';
import { CONNECTIVITY } from '../../../../src/app.config';

// Fake controlable de Connectivity: el test setea el estado actual y dispara
// transiciones manualmente. Registra las suscripciones para verificar
// idempotencia de subscribe() y unsubscribe.
class FakeConnectivity implements Connectivity {
  private isOnline: boolean;
  private listeners: ((v: boolean) => void)[] = [];
  public subscribeCalls = 0;
  public unsubscribeCalls = 0;

  constructor(initialOnline: boolean) {
    this.isOnline = initialOnline;
  }

  setCurrent(v: boolean): void {
    this.isOnline = v;
  }

  current(): boolean {
    return this.isOnline;
  }

  subscribe(listener: (v: boolean) => void): ConnectivityUnsubscribe {
    this.subscribeCalls++;
    this.listeners.push(listener);
    return () => {
      this.unsubscribeCalls++;
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  // Notifica a TODOS los listeners actuales (simula la transición).
  emit(v: boolean): void {
    this.isOnline = v;
    [...this.listeners].forEach((l) => l(v));
  }

  listenerCount(): number {
    return this.listeners.length;
  }
}

// Fake del use case L2 con willResolve / willReject + contador de calls.
class FakeRetomarUseCase {
  public calls = 0;
  private mode: 'resolve' | 'reject' = 'resolve';
  private nextError: Error | null = null;

  willResolve(): void {
    this.mode = 'resolve';
  }

  willReject(error: Error): void {
    this.mode = 'reject';
    this.nextError = error;
  }

  async execute(): Promise<void> {
    this.calls++;
    if (this.mode === 'reject' && this.nextError !== null) {
      throw this.nextError;
    }
  }
}

// Cubre `EnvioRetryDispatcher` (L3) según spec sec.9 Req 2 (retry tras
// volver la red) + el comportamiento del bootstrap (start idempotente,
// errores silenciados, unsubscribe en destroy).
describe('EnvioRetryDispatcher', () => {
  let connectivity: FakeConnectivity;
  let retomar: FakeRetomarUseCase;
  let dispatcher: EnvioRetryDispatcher;

  const buildDispatcher = (online: boolean) => {
    connectivity = new FakeConnectivity(online);
    retomar = new FakeRetomarUseCase();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CONNECTIVITY, useValue: connectivity },
        { provide: RetomarEnviosPendientesUseCase, useValue: retomar },
        EnvioRetryDispatcher,
      ],
    });
    dispatcher = TestBed.inject(EnvioRetryDispatcher);
  };

  // Helper para esperar a que el `void this.retomar.execute().catch(...)`
  // microtask haya corrido antes de assertear.
  const flushMicrotasks = async (iterations = 5): Promise<void> => {
    for (let i = 0; i < iterations; i++) {
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    // Cada test construye su propio dispatcher para asegurar aislamiento.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('start() — estado inicial', () => {
    it('online en el arranque → invoca retomar.execute inmediatamente', async () => {
      buildDispatcher(true);
      retomar.willResolve();

      dispatcher.start();
      await flushMicrotasks();

      expect(retomar.calls).toBe(1);
    });

    it('offline en el arranque → NO invoca retomar.execute en start', async () => {
      buildDispatcher(false);
      retomar.willResolve();

      dispatcher.start();
      await flushMicrotasks();

      expect(retomar.calls).toBe(0);
    });

    it('siempre se suscribe a connectivity en start (sin importar estado inicial)', () => {
      buildDispatcher(false);
      retomar.willResolve();

      dispatcher.start();

      expect(connectivity.subscribeCalls).toBe(1);
      expect(connectivity.listenerCount()).toBe(1);
    });
  });

  describe('reacción a transiciones de connectivity', () => {
    it('transición offline → online dispara retomar.execute', async () => {
      buildDispatcher(false);
      retomar.willResolve();

      dispatcher.start();
      await flushMicrotasks();
      expect(retomar.calls).toBe(0);

      connectivity.emit(true);
      await flushMicrotasks();

      expect(retomar.calls).toBe(1);
    });

    it('transición online → offline NO dispara retomar.execute', async () => {
      buildDispatcher(true);
      retomar.willResolve();

      dispatcher.start();
      await flushMicrotasks();
      expect(retomar.calls).toBe(1); // por el start con online

      connectivity.emit(false);
      await flushMicrotasks();

      // Sigue siendo 1: la transición a offline no dispara nada.
      expect(retomar.calls).toBe(1);
    });

    it('múltiples transiciones a online (offline→online→offline→online) disparan 1 retomar por cada vuelta a online', async () => {
      buildDispatcher(false);
      retomar.willResolve();

      dispatcher.start();
      await flushMicrotasks();

      connectivity.emit(true);
      await flushMicrotasks();
      connectivity.emit(false);
      await flushMicrotasks();
      connectivity.emit(true);
      await flushMicrotasks();

      expect(retomar.calls).toBe(2);
    });
  });

  describe('idempotencia de start()', () => {
    it('start() invocado dos veces NO doble-subscribe ni doble-invoca', async () => {
      buildDispatcher(true);
      retomar.willResolve();

      dispatcher.start();
      dispatcher.start();
      await flushMicrotasks();

      expect(retomar.calls).toBe(1);
      expect(connectivity.subscribeCalls).toBe(1);
      expect(connectivity.listenerCount()).toBe(1);
    });
  });

  describe('ngOnDestroy — unsubscribe', () => {
    it('al destruir, unsubscribe se invoca y futuras transiciones no disparan retomar', async () => {
      buildDispatcher(false);
      retomar.willResolve();

      dispatcher.start();
      dispatcher.ngOnDestroy();

      expect(connectivity.unsubscribeCalls).toBe(1);
      expect(connectivity.listenerCount()).toBe(0);

      // Tras destroy, emitir online no debería invocar al use case (porque
      // el listener ya fue removido del fake).
      connectivity.emit(true);
      await flushMicrotasks();
      expect(retomar.calls).toBe(0);
    });
  });

  describe('errores silenciados', () => {
    it('errores de retomar al arrancar no propagan (start completa sin throw)', async () => {
      buildDispatcher(true);
      retomar.willReject(new Error('boom!'));

      expect(() => dispatcher.start()).not.toThrow();
      // Damos tiempo a la microtask del .catch()
      await flushMicrotasks();
      expect(retomar.calls).toBe(1);
    });

    it('errores de retomar tras transición online no propagan', async () => {
      buildDispatcher(false);
      retomar.willReject(new Error('boom!'));

      dispatcher.start();
      // No debería tirar al emitir el evento.
      expect(() => connectivity.emit(true)).not.toThrow();
      await flushMicrotasks();
      expect(retomar.calls).toBe(1);
    });
  });
});
