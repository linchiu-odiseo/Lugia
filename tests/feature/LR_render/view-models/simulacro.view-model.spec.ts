import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { SimulacroPageViewModel } from '../../../../src/LR_render/view-models/simulacro.view-model';
import { ObtenerSimulacrosDelDiaUseCase } from '../../../../src/L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { MarcarRespuestaUseCase } from '../../../../src/L2_application/use-cases/marcar-respuesta.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../../../src/app.config';
import { Simulacro } from '../../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../../src/L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../../../src/L1_domain/value-objects/server-time';
import { Alternativa } from '../../../../src/L1_domain/value-objects/alternativa';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { SessionExpiredError } from '../../../../src/L1_domain/errors/session-expired.error';
import { Clock } from '../../../../src/L1_domain/ports/clock';
import {
  AlternativaValue,
  AnswersMap,
  EnvioPendiente,
  MarkingsStorage,
} from '../../../../src/L1_domain/ports/markings-storage';

// Stubs de ruta para que provideRouter no se queje cuando el VM navega.
@Component({ template: '' })
class HomeStub {}
@Component({ template: '' })
class LoginStub {}

class FakeObtenerSimulacrosDelDiaUseCase {
  private next:
    | { kind: 'resolve'; list: readonly Simulacro[] }
    | { kind: 'reject'; error: Error } = { kind: 'resolve', list: [] };
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

// Spy del use case L2 que registra las llamadas y delega la persistencia
// al fake del storage — así verificamos que el VM (a) invocó al use case y
// (b) terminó con el storage actualizado, ambos a través del path real.
class FakeMarcarRespuestaUseCase {
  public calls: { simulacroId: string; pregunta: number; alternativa: AlternativaValue }[] = [];
  private failNext: Error | null = null;

  constructor(private readonly markings: MarkingsStorage) {}

  willReject(error: Error) {
    this.failNext = error;
  }

  async execute(input: {
    simulacroId: string;
    pregunta: number;
    alternativa: Alternativa;
  }): Promise<void> {
    this.calls.push({
      simulacroId: input.simulacroId,
      pregunta: input.pregunta,
      alternativa: input.alternativa.value,
    });
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    await this.markings.setMarcacion(input.simulacroId, input.pregunta, input.alternativa.value);
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
    /* no-op */
  }
}

// Fake mínimo del puerto MarkingsStorage para tests del VM.
// Mantiene un map por simulacro y permite sembrar marcaciones iniciales.
class FakeMarkingsStorage implements MarkingsStorage {
  private store = new Map<string, AnswersMap>();
  private setCalls: { id: string; pregunta: number; alt: AlternativaValue }[] = [];

  seedMarcaciones(simulacroId: string, answers: AnswersMap): void {
    this.store.set(simulacroId, { ...answers });
  }

  getSetCalls(): readonly { id: string; pregunta: number; alt: AlternativaValue }[] {
    return this.setCalls;
  }

  async setMarcacion(
    simulacroId: string,
    pregunta: number,
    alternativa: AlternativaValue,
  ): Promise<void> {
    this.setCalls.push({ id: simulacroId, pregunta, alt: alternativa });
    const existing = this.store.get(simulacroId) ?? {};
    existing[String(pregunta)] = alternativa;
    this.store.set(simulacroId, existing);
  }

  async getMarcaciones(simulacroId: string): Promise<AnswersMap> {
    return { ...(this.store.get(simulacroId) ?? {}) };
  }

  async clearMarcaciones(_simulacroId: string): Promise<void> {
    /* no-op */
  }
  async enqueueEnvio(_envio: EnvioPendiente): Promise<void> {
    /* no-op */
  }
  async getEnviosPendientes(): Promise<EnvioPendiente[]> {
    return [];
  }
  async dequeueEnvio(_simulacroId: string): Promise<void> {
    /* no-op */
  }
  async wipeUserScope(): Promise<void> {
    /* no-op */
  }
}

// Helpers
const buildSimulacro = (
  id: string,
  estadoValue: 'pendiente' | 'abierto' | 'enviado' | 'cerrado',
  overrides: Partial<{ count: number; inicio: Date; fin: Date }> = {},
): Simulacro =>
  new Simulacro({
    id,
    area: 'Matemática',
    name: `Simulacro ${id}`,
    count: overrides.count ?? 20,
    inicio: overrides.inicio ?? new Date('2026-06-11T10:00:00Z'),
    fin: overrides.fin ?? new Date('2026-06-11T12:00:00Z'),
    estado: new EstadoSimulacro(estadoValue),
  });

describe('SimulacroPageViewModel', () => {
  let fakeObtener: FakeObtenerSimulacrosDelDiaUseCase;
  let fakeClock: FakeClock;
  let fakeMarkings: FakeMarkingsStorage;
  let fakeMarcar: FakeMarcarRespuestaUseCase;

  // Instanciamos el VM dentro del contexto de inyección para que inject()
  // resuelva contra los providers del TestBed.
  const createVm = (): SimulacroPageViewModel =>
    TestBed.runInInjectionContext(() => new SimulacroPageViewModel());

  beforeEach(async () => {
    fakeObtener = new FakeObtenerSimulacrosDelDiaUseCase();
    fakeClock = new FakeClock();
    fakeMarkings = new FakeMarkingsStorage();
    fakeMarcar = new FakeMarcarRespuestaUseCase(fakeMarkings);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'home', component: HomeStub },
          { path: 'login', component: LoginStub },
        ]),
        { provide: ObtenerSimulacrosDelDiaUseCase, useValue: fakeObtener },
        { provide: MarcarRespuestaUseCase, useValue: fakeMarcar },
        { provide: CLOCK, useValue: fakeClock },
        { provide: MARKINGS_STORAGE, useValue: fakeMarkings },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('start() — bloqueo por estado / not-found', () => {
    it('id que no existe en la lista → errorState=not-found y redirect /home', async () => {
      fakeObtener.willResolve([buildSimulacro('sim-otro', 'abierto')]);
      const vm = createVm();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.start('sim-no-existe');

      expect(vm.errorState()).toBe('not-found');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      expect(vm.simulacro()).toBeNull();
      vm.stop();
    });

    it('simulacro en estado "pendiente" → errorState=pendiente y redirect /home', async () => {
      fakeObtener.willResolve([buildSimulacro('sim-1', 'pendiente')]);
      const vm = createVm();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.start('sim-1');

      expect(vm.errorState()).toBe('pendiente');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      expect(vm.simulacro()).toBeNull();
      vm.stop();
    });

    it('simulacro en estado "cerrado" → errorState=cerrado y redirect /home', async () => {
      fakeObtener.willResolve([buildSimulacro('sim-1', 'cerrado')]);
      const vm = createVm();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.start('sim-1');

      expect(vm.errorState()).toBe('cerrado');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('simulacro en estado "enviado" → errorState=enviado y redirect /home', async () => {
      fakeObtener.willResolve([buildSimulacro('sim-1', 'enviado')]);
      const vm = createVm();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.start('sim-1');

      expect(vm.errorState()).toBe('enviado');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('id vacío → errorState=not-found sin invocar al use case', async () => {
      const vm = createVm();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.start('   ');

      expect(vm.errorState()).toBe('not-found');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      expect(fakeObtener.callCount).toBe(0);
      vm.stop();
    });
  });

  describe('start() — simulacro abierto', () => {
    it('setea simulacro, isLoading=false, errorState=null', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);

      const vm = createVm();
      await vm.start('sim-1');

      expect(vm.simulacro()).toBe(sim);
      expect(vm.isLoading()).toBe(false);
      expect(vm.errorState()).toBeNull();
      vm.stop();
    });

    it('lee marcaciones del storage y produce un mapa denso (todas las preguntas)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'A', '4': 'D' });

      const vm = createVm();
      await vm.start('sim-1');

      // Mapa denso: las preguntas sin marca quedan en null.
      expect(vm.marcaciones()).toEqual({
        '1': null,
        '2': 'A',
        '3': null,
        '4': 'D',
        '5': null,
      });
      vm.stop();
    });

    it('preguntas() es una lista 1..count cuando el simulacro está cargado', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);

      const vm = createVm();
      await vm.start('sim-1');

      expect(vm.preguntas()).toEqual([1, 2, 3]);
      vm.stop();
    });

    it('trimea el id recibido (matchea contra la lista usando el id trimeado)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);

      const vm = createVm();
      await vm.start('  sim-1  ');

      expect(vm.simulacro()).toBe(sim);
      expect(vm.errorState()).toBeNull();
      vm.stop();
    });
  });

  describe('marcar()', () => {
    it('marcar pregunta sin marca previa → invoca use case y signal refleja la letra', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      await vm.marcar(5, 'C');

      expect(fakeMarcar.calls).toEqual([
        { simulacroId: 'sim-1', pregunta: 5, alternativa: 'C' },
      ]);
      expect(vm.marcaciones()['5']).toBe('C');
      vm.stop();
    });

    it('marcar la misma letra que ya está marcada → desmarca (toggle a null)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      const vm = createVm();
      await vm.start('sim-1');

      await vm.marcar(5, 'C');

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        simulacroId: 'sim-1',
        pregunta: 5,
        alternativa: null,
      });
      expect(vm.marcaciones()['5']).toBeNull();
      vm.stop();
    });

    it('marcar letra distinta a la actual → reemplaza la letra (sin desmarcar)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      const vm = createVm();
      await vm.start('sim-1');

      await vm.marcar(5, 'A');

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        simulacroId: 'sim-1',
        pregunta: 5,
        alternativa: 'A',
      });
      expect(vm.marcaciones()['5']).toBe('A');
      vm.stop();
    });

    it('marca otras preguntas sin tocar las preguntas previas', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '1': 'B' });
      const vm = createVm();
      await vm.start('sim-1');

      await vm.marcar(3, 'D');

      expect(vm.marcaciones()['1']).toBe('B');
      expect(vm.marcaciones()['3']).toBe('D');
      vm.stop();
    });
  });

  describe('ticker — expiración durante la sesión', () => {
    it('cuando now() >= simulacro.fin, setea errorState=expired-during-session y redirige a /home', async () => {
      const inicio = new Date('2026-06-11T10:00:00Z');
      const fin = new Date('2026-06-11T10:00:05Z');
      fakeClock.setNow(inicio);
      const sim = buildSimulacro('sim-1', 'abierto', { inicio, fin });
      fakeObtener.willResolve([sim]);

      vi.useFakeTimers();
      const vm = createVm();
      await vm.start('sim-1');

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      // Avanzamos el Clock al `fin` y luego al primer tick que detecta expire.
      fakeClock.setNow(new Date(fin.getTime()));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(vm.errorState()).toBe('expired-during-session');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('mientras el reloj no llegue a fin, errorState sigue null y el tick no redirige', async () => {
      const inicio = new Date('2026-06-11T10:00:00Z');
      const fin = new Date('2026-06-11T11:00:00Z');
      fakeClock.setNow(inicio);
      const sim = buildSimulacro('sim-1', 'abierto', { inicio, fin });
      fakeObtener.willResolve([sim]);

      vi.useFakeTimers();
      const vm = createVm();
      await vm.start('sim-1');

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      // Tick pero seguimos muy lejos de fin.
      fakeClock.setNow(new Date('2026-06-11T10:00:01Z'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(vm.errorState()).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalled();
      vm.stop();
    });
  });

  describe('start() — clasificación de errores del use case', () => {
    it('SessionExpiredError → errorState=session-expired y redirect /login', async () => {
      fakeObtener.willReject(new SessionExpiredError());
      const vm = createVm();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.start('sim-1');

      expect(vm.errorState()).toBe('session-expired');
      expect(navigateSpy).toHaveBeenCalledWith(['/login']);
      vm.stop();
    });

    it('NetworkError → errorState=network y redirect /home', async () => {
      fakeObtener.willReject(new NetworkError());
      const vm = createVm();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.start('sim-1');

      expect(vm.errorState()).toBe('network');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('error desconocido → errorState=unknown y re-lanza para no silenciar bugs', async () => {
      fakeObtener.willReject(new Error('boom!'));
      const vm = createVm();

      await expect(vm.start('sim-1')).rejects.toThrow('boom!');
      expect(vm.errorState()).toBe('unknown');
      vm.stop();
    });
  });

  describe('volver()', () => {
    it('navega a /home y NO toca simulacro/marcaciones/errorState', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const simBefore = vm.simulacro();
      const marcsBefore = vm.marcaciones();
      const errBefore = vm.errorState();

      vm.volver();

      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      expect(vm.simulacro()).toBe(simBefore);
      expect(vm.marcaciones()).toBe(marcsBefore);
      expect(vm.errorState()).toBe(errBefore);
      vm.stop();
    });
  });

  describe('stop()', () => {
    it('cancela el ticker: avanzar timers no dispara más checks de expiración', async () => {
      const inicio = new Date('2026-06-11T10:00:00Z');
      const fin = new Date('2026-06-11T10:00:05Z');
      fakeClock.setNow(inicio);
      const sim = buildSimulacro('sim-1', 'abierto', { inicio, fin });
      fakeObtener.willResolve([sim]);

      vi.useFakeTimers();
      const vm = createVm();
      await vm.start('sim-1');

      vm.stop();

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      // Aunque crucemos `fin`, el ticker ya está cancelado.
      fakeClock.setNow(new Date('2026-06-11T10:00:10Z'));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(vm.errorState()).toBeNull();
    });
  });
});
