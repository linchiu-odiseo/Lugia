import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { HomePageViewModel } from '../../../../src/LR_render/view-models/home.view-model';
import { ObtenerSimulacrosDelDiaUseCase } from '../../../../src/L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../../../src/app.config';
import { Simulacro } from '../../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../../src/L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../../../src/L1_domain/value-objects/server-time';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { SessionExpiredError } from '../../../../src/L1_domain/errors/session-expired.error';
import { OfflineStorageUnavailableError } from '../../../../src/L1_domain/errors/offline-storage-unavailable.error';
import { Clock } from '../../../../src/L1_domain/ports/clock';
import {
  AlternativaValue,
  AnswersMap,
  EnvioPendiente,
  MarkingsStorage,
} from '../../../../src/L1_domain/ports/markings-storage';

// Stubs de ruta para que provideRouter no se queje cuando el VM navega a /login.
@Component({ template: '' })
class LoginStub {}

class FakeObtenerSimulacrosDelDiaUseCase {
  private next: { kind: 'resolve'; list: readonly Simulacro[] } | { kind: 'reject'; error: Error } =
    {
      kind: 'resolve',
      list: [],
    };
  public callCount = 0;

  willResolve(list: readonly Simulacro[]) {
    this.next = { kind: 'resolve', list };
  }
  willReject(error: Error) {
    this.next = { kind: 'reject', error };
  }

  async execute(): Promise<readonly Simulacro[]> {
    this.callCount++;
    if (this.next.kind === 'reject') throw this.next.error;
    return this.next.list;
  }
}

class FakeClock implements Clock {
  private current: Date = new Date('2026-06-11T10:00:00Z');

  setNow(d: Date) {
    this.current = d;
  }
  now(): Date {
    return this.current;
  }
  setServerTime(_st: ServerTime): void {
    /* no-op para los tests del VM */
  }
}

class FakeMarkingsStorage implements MarkingsStorage {
  private next: { kind: 'resolve'; list: EnvioPendiente[] } | { kind: 'reject'; error: Error } = {
    kind: 'resolve',
    list: [],
  };

  willResolveEnviosPendientes(list: EnvioPendiente[] = []) {
    this.next = { kind: 'resolve', list };
  }
  willRejectEnviosPendientes(error: Error) {
    this.next = { kind: 'reject', error };
  }

  async getEnviosPendientes(): Promise<EnvioPendiente[]> {
    if (this.next.kind === 'reject') throw this.next.error;
    return this.next.list;
  }
  async setMarcacion(
    _simulacroId: string,
    _pregunta: number,
    _alternativa: AlternativaValue,
  ): Promise<void> {
    /* no-op: pre-check de IDB es el único método usado por el VM */
  }
  async getMarcaciones(_simulacroId: string): Promise<AnswersMap> {
    return {};
  }
  async clearMarcaciones(_simulacroId: string): Promise<void> {
    /* no-op */
  }
  async enqueueEnvio(_envio: EnvioPendiente): Promise<void> {
    /* no-op */
  }
  async dequeueEnvio(_simulacroId: string): Promise<void> {
    /* no-op */
  }
  async wipeUserScope(): Promise<void> {
    /* no-op */
  }
}

const buildSimulacro = (
  id: string,
  estadoValue: 'pendiente' | 'abierto' | 'enviado' | 'cerrado',
): Simulacro =>
  new Simulacro({
    id,
    area: 'Matemática',
    name: `Simulacro ${id}`,
    count: 20,
    inicio: new Date('2026-06-11T10:00:00Z'),
    fin: new Date('2026-06-11T12:00:00Z'),
    estado: new EstadoSimulacro(estadoValue),
  });

// Helper para setear visibility en jsdom (el getter es de solo-lectura por default).
const setDocumentVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', {
    value: state === 'hidden',
    configurable: true,
  });
};

describe('HomePageViewModel', () => {
  let fakeObtener: FakeObtenerSimulacrosDelDiaUseCase;
  let fakeClock: FakeClock;
  let fakeMarkings: FakeMarkingsStorage;

  // Instanciamos el VM dentro del contexto de inyección para que inject()
  // resuelva contra el TestBed providers.
  const createVm = (): HomePageViewModel =>
    TestBed.runInInjectionContext(() => new HomePageViewModel());

  beforeEach(async () => {
    fakeObtener = new FakeObtenerSimulacrosDelDiaUseCase();
    fakeClock = new FakeClock();
    fakeMarkings = new FakeMarkingsStorage();

    // Default: visible. Cada test que necesite hidden lo cambia explícito.
    setDocumentVisibility('visible');

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', component: LoginStub }]),
        { provide: ObtenerSimulacrosDelDiaUseCase, useValue: fakeObtener },
        { provide: CLOCK, useValue: fakeClock },
        { provide: MARKINGS_STORAGE, useValue: fakeMarkings },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setDocumentVisibility('visible');
  });

  describe('start() — pre-check de IndexedDB', () => {
    it('marca offlineStorageBlocked=true cuando el pre-check rechaza con OfflineStorageUnavailableError', async () => {
      fakeMarkings.willRejectEnviosPendientes(
        new OfflineStorageUnavailableError('IDB unavailable'),
      );
      fakeObtener.willResolve([]);

      const vm = createVm();
      await vm.start();

      expect(vm.offlineStorageBlocked()).toBe(true);
      vm.stop();
    });

    it('mantiene offlineStorageBlocked=false cuando el pre-check resuelve OK', async () => {
      fakeMarkings.willResolveEnviosPendientes([]);
      fakeObtener.willResolve([]);

      const vm = createVm();
      await vm.start();

      expect(vm.offlineStorageBlocked()).toBe(false);
      vm.stop();
    });
  });

  describe('start() + primer fetch', () => {
    it('después del primer fetch exitoso, simulacros() tiene la lista y isLoading() es false', async () => {
      const list = [buildSimulacro('sim-1', 'abierto'), buildSimulacro('sim-2', 'pendiente')];
      fakeObtener.willResolve(list);

      const vm = createVm();
      await vm.start();

      expect(vm.simulacros()).toEqual(list);
      expect(vm.isLoading()).toBe(false);
      expect(vm.serverError()).toBeNull();
      expect(vm.lastRefreshAt()).not.toBeNull();
      vm.stop();
    });
  });

  describe('refresh() — clasificación de errores', () => {
    it('happy path: actualiza simulacros() y limpia serverError', async () => {
      fakeObtener.willResolve([]);
      const vm = createVm();
      await vm.start();

      const list = [buildSimulacro('sim-1', 'abierto')];
      fakeObtener.willResolve(list);
      await vm.refresh();

      expect(vm.simulacros()).toEqual(list);
      expect(vm.serverError()).toBeNull();
      vm.stop();
    });

    it('SessionExpiredError setea serverError=session-expired y navega a /login', async () => {
      fakeObtener.willResolve([]);
      const vm = createVm();
      await vm.start();

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fakeObtener.willReject(new SessionExpiredError());
      await vm.refresh();

      expect(vm.serverError()).toBe('session-expired');
      expect(navigateSpy).toHaveBeenCalledWith(['/login']);
      vm.stop();
    });

    it('NetworkError setea serverError=network sin navegar', async () => {
      fakeObtener.willResolve([]);
      const vm = createVm();
      await vm.start();

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fakeObtener.willReject(new NetworkError());
      await vm.refresh();

      expect(vm.serverError()).toBe('network');
      expect(navigateSpy).not.toHaveBeenCalled();
      vm.stop();
    });

    it('error desconocido setea serverError=unknown y re-lanza para no silenciar bugs', async () => {
      fakeObtener.willResolve([]);
      const vm = createVm();
      await vm.start();

      fakeObtener.willReject(new Error('boom!'));
      await expect(vm.refresh()).rejects.toThrow('boom!');
      expect(vm.serverError()).toBe('unknown');
      vm.stop();
    });
  });

  describe('polling cada 120s', () => {
    it('después de 120s desde start(), invoca obtener.execute() una segunda vez', async () => {
      fakeObtener.willResolve([]);
      // Para evitar problemas con visibilityState al mockearlo en jsdom:
      // arrancamos con visible y fake timers ya activos.
      vi.useFakeTimers();
      setDocumentVisibility('visible');

      const vm = createVm();
      await vm.start();
      const callsAfterStart = fakeObtener.callCount;

      // Avanzamos exactamente el intervalo de polling.
      await vi.advanceTimersByTimeAsync(120_000);

      expect(fakeObtener.callCount).toBe(callsAfterStart + 1);
      vm.stop();
    });

    it('NO arranca polling si la pestaña no está visible al momento de start()', async () => {
      fakeObtener.willResolve([]);
      setDocumentVisibility('hidden');
      vi.useFakeTimers();

      const vm = createVm();
      await vm.start();
      const callsAfterStart = fakeObtener.callCount;

      // Avanzamos varios intervalos: como no hay polling armado, no debería
      // invocar el use case (más allá del fetch inicial del start()).
      await vi.advanceTimersByTimeAsync(360_000);

      expect(fakeObtener.callCount).toBe(callsAfterStart);
      vm.stop();
    });

    it('stop() cancela el polling: avanzar timers después de stop NO invoca más el use case', async () => {
      fakeObtener.willResolve([]);
      setDocumentVisibility('visible');
      vi.useFakeTimers();

      const vm = createVm();
      await vm.start();
      vm.stop();
      const callsAtStop = fakeObtener.callCount;

      await vi.advanceTimersByTimeAsync(360_000);

      expect(fakeObtener.callCount).toBe(callsAtStop);
    });
  });

  describe('countdown ticker (nowTick)', () => {
    it('después de 1 segundo, nowTick re-emite con el now() del Clock actualizado', async () => {
      fakeObtener.willResolve([]);
      setDocumentVisibility('visible');
      vi.useFakeTimers();

      const initialNow = new Date('2026-06-11T10:00:00Z');
      const oneSecondLater = new Date('2026-06-11T10:00:01Z');
      fakeClock.setNow(initialNow);

      const vm = createVm();
      await vm.start();
      expect(vm.nowTick().getTime()).toBe(initialNow.getTime());

      // Avanzamos el Clock primero (la UI normal lo recibe via setServerTime
      // en el siguiente GET, pero aquí solo importa que el VM lo lea fresh).
      fakeClock.setNow(oneSecondLater);
      await vi.advanceTimersByTimeAsync(1_000);

      expect(vm.nowTick().getTime()).toBe(oneSecondLater.getTime());
      vm.stop();
    });
  });

  describe('degradación graceful: dos simulacros abiertos', () => {
    it('emite console.warn con count + primer id cuando vienen 2 abiertos simultáneos', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      fakeObtener.willResolve([
        buildSimulacro('sim-A', 'abierto'),
        buildSimulacro('sim-B', 'abierto'),
      ]);

      const vm = createVm();
      await vm.start();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = warnSpy.mock.calls[0][0] as string;
      // Verificamos shape sin pegarnos al wording exacto del mensaje.
      expect(message).toContain('2');
      expect(message).toContain('sim-A');
      vm.stop();
    });

    it('NO emite warn cuando hay un único simulacro abierto', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      fakeObtener.willResolve([
        buildSimulacro('sim-A', 'abierto'),
        buildSimulacro('sim-B', 'pendiente'),
      ]);

      const vm = createVm();
      await vm.start();

      expect(warnSpy).not.toHaveBeenCalled();
      vm.stop();
    });
  });
});
