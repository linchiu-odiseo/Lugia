import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { SimulacroPageViewModel } from '../../../../src/LR_render/view-models/simulacro.view-model';
import { ObtenerSimulacrosDelDiaUseCase } from '../../../../src/L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { MarcarRespuestaUseCase } from '../../../../src/L2_application/use-cases/marcar-respuesta.use-case';
import {
  EnviarSimulacroInput,
  EnviarSimulacroOutput,
  EnviarSimulacroUseCase,
} from '../../../../src/L2_application/use-cases/enviar-simulacro.use-case';
import {
  AutoEnvioHandle,
  ProgramarAutoEnvioInput,
  ProgramarAutoEnvioUseCase,
} from '../../../../src/L2_application/use-cases/programar-auto-envio.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../../../src/app.config';
import { Simulacro } from '../../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../../src/L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../../../src/L1_domain/value-objects/server-time';
import { Alternativa } from '../../../../src/L1_domain/value-objects/alternativa';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { SessionExpiredError } from '../../../../src/L1_domain/errors/session-expired.error';
import { SimulacroCerradoError } from '../../../../src/L1_domain/errors/simulacro-cerrado.error';
import { SimulacroNoAsignadoError } from '../../../../src/L1_domain/errors/simulacro-no-asignado.error';
import { InvalidSubmissionTimeError } from '../../../../src/L1_domain/errors/invalid-submission-time.error';
import { InvalidPayloadError } from '../../../../src/L1_domain/errors/invalid-payload.error';
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
  private next: { kind: 'resolve'; list: readonly Simulacro[] } | { kind: 'reject'; error: Error } =
    { kind: 'resolve', list: [] };
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

// Fake del EnviarSimulacroUseCase con control fino sobre resolución/rechazo
// y registro de llamadas. Útil para tests de `submit()` y del callback
// `onResult` del auto-envío.
class FakeEnviarSimulacroUseCase {
  public calls: EnviarSimulacroInput[] = [];
  private plan:
    | { kind: 'resolve'; result: EnviarSimulacroOutput }
    | { kind: 'reject'; error: Error }
    | { kind: 'pending'; resolve: (r: EnviarSimulacroOutput) => void; reject: (e: Error) => void }
    | null = null;
  // Para tests de "doble click", contamos las llamadas mientras la primera
  // está pendiente — la promise se resuelve manualmente desde el test.
  public pendingPromise: Promise<EnviarSimulacroOutput> | null = null;

  willResolve(result: EnviarSimulacroOutput): void {
    this.plan = { kind: 'resolve', result };
  }

  willReject(error: Error): void {
    this.plan = { kind: 'reject', error };
  }

  // Devuelve un control { resolve, reject } para que el test decida cuándo
  // completar la primera invocación. Útil para verificar idempotencia.
  willStayPending(): { resolve: (r: EnviarSimulacroOutput) => void; reject: (e: Error) => void } {
    let res!: (r: EnviarSimulacroOutput) => void;
    let rej!: (e: Error) => void;
    this.pendingPromise = new Promise<EnviarSimulacroOutput>((r, e) => {
      res = r;
      rej = e;
    });
    this.plan = { kind: 'pending', resolve: res, reject: rej };
    return { resolve: res, reject: rej };
  }

  async execute(input: EnviarSimulacroInput): Promise<EnviarSimulacroOutput> {
    this.calls.push(input);
    if (this.plan === null) {
      throw new Error('FakeEnviarSimulacroUseCase: configurar plan antes de invocar execute');
    }
    if (this.plan.kind === 'reject') throw this.plan.error;
    if (this.plan.kind === 'resolve') return this.plan.result;
    // pending: devuelve la promise que el test controlará a mano.
    if (this.pendingPromise === null) {
      throw new Error('FakeEnviarSimulacroUseCase: pendingPromise no inicializada');
    }
    return this.pendingPromise;
  }
}

// Fake del ProgramarAutoEnvioUseCase: NO dispara un timer real. Captura el
// input (sobre todo callbacks) para que el test pueda invocarlos a mano.
// Esto desacopla los tests del view-model de la lógica de jitter (cubierta
// en su propio spec).
class FakeProgramarAutoEnvioUseCase {
  public calls: ProgramarAutoEnvioInput[] = [];
  public lastHandle: AutoEnvioHandle | null = null;
  public cancelCalls = 0;

  execute(input: ProgramarAutoEnvioInput): AutoEnvioHandle {
    this.calls.push(input);
    const handle: AutoEnvioHandle = {
      cancel: () => {
        this.cancelCalls++;
      },
    };
    this.lastHandle = handle;
    return handle;
  }

  // Helpers para que el test "fire" el auto-envío manualmente.
  fireOnResult(result: EnviarSimulacroOutput): void {
    const last = this.calls[this.calls.length - 1];
    last.onResult?.(result);
  }
  fireOnError(err: unknown): void {
    const last = this.calls[this.calls.length - 1];
    last.onError?.(err);
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
  let fakeEnviar: FakeEnviarSimulacroUseCase;
  let fakeProgramar: FakeProgramarAutoEnvioUseCase;

  // Instanciamos el VM dentro del contexto de inyección para que inject()
  // resuelva contra los providers del TestBed.
  const createVm = (): SimulacroPageViewModel =>
    TestBed.runInInjectionContext(() => new SimulacroPageViewModel());

  beforeEach(async () => {
    fakeObtener = new FakeObtenerSimulacrosDelDiaUseCase();
    fakeClock = new FakeClock();
    fakeMarkings = new FakeMarkingsStorage();
    fakeMarcar = new FakeMarcarRespuestaUseCase(fakeMarkings);
    fakeEnviar = new FakeEnviarSimulacroUseCase();
    fakeProgramar = new FakeProgramarAutoEnvioUseCase();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'home', component: HomeStub },
          { path: 'login', component: LoginStub },
        ]),
        { provide: ObtenerSimulacrosDelDiaUseCase, useValue: fakeObtener },
        { provide: MarcarRespuestaUseCase, useValue: fakeMarcar },
        { provide: EnviarSimulacroUseCase, useValue: fakeEnviar },
        { provide: ProgramarAutoEnvioUseCase, useValue: fakeProgramar },
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

      expect(fakeMarcar.calls).toEqual([{ simulacroId: 'sim-1', pregunta: 5, alternativa: 'C' }]);
      expect(vm.marcaciones()['5']).toBe('C');
      vm.stop();
    });

    it('marcar la misma letra en modo edición → desmarca (toggle a null) y la fila vuelve a unmarked', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      const vm = createVm();
      await vm.start('sim-1');

      // Fila empieza locked (tiene marca C). Para cambiar/desmarcar hay
      // que entrar a edición primero — sin eso, el tap es no-op.
      expect(vm.rowState(5)).toBe('locked');
      vm.enterEditing(5);
      expect(vm.rowState(5)).toBe('editing');

      await vm.marcar(5, 'C');

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        simulacroId: 'sim-1',
        pregunta: 5,
        alternativa: null,
      });
      expect(vm.marcaciones()['5']).toBeNull();
      // Tras aplicar el cambio, sale de edición y como ya no hay marca
      // queda en `unmarked`.
      expect(vm.rowState(5)).toBe('unmarked');
      vm.stop();
    });

    it('marcar letra distinta en modo edición → reemplaza la letra y la fila vuelve a locked', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      const vm = createVm();
      await vm.start('sim-1');

      // Fila empieza locked. Entramos a edición y luego cambiamos.
      expect(vm.rowState(5)).toBe('locked');
      vm.enterEditing(5);
      expect(vm.rowState(5)).toBe('editing');

      await vm.marcar(5, 'A');

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        simulacroId: 'sim-1',
        pregunta: 5,
        alternativa: 'A',
      });
      expect(vm.marcaciones()['5']).toBe('A');
      // Cambio aplicado → fila vuelve a locked con la nueva marca.
      expect(vm.rowState(5)).toBe('locked');
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

  // -----------------------------------------------------------------------
  // Protección contra cambios accidentales (Requirement en exam-marking)
  //
  // Las filas tienen 3 estados: `unmarked` | `locked` | `editing`. El primer
  // marcado entra a `locked`; modificar requiere `editing` (entrada por
  // long-press en el page). En el view-model probamos directo la máquina
  // de estados sin simular el long-press.
  // -----------------------------------------------------------------------
  describe('protección contra cambios accidentales — máquina de estados de fila', () => {
    it('rowState() default es `unmarked` para una pregunta sin marca', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      expect(vm.rowState(3)).toBe('unmarked');
      expect(vm.editingRow()).toBeNull();
      vm.stop();
    });

    it('tras marcar(5, C), rowState(5) pasa a `locked`', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      await vm.marcar(5, 'C');

      expect(vm.rowState(5)).toBe('locked');
      vm.stop();
    });

    it('enterEditing(5) sobre fila locked → rowState=editing, editingRow=5', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      const vm = createVm();
      await vm.start('sim-1');

      vm.enterEditing(5);

      expect(vm.rowState(5)).toBe('editing');
      expect(vm.editingRow()).toBe(5);
      vm.stop();
    });

    it('enterEditing(5) sobre fila unmarked → no-op (rowState sigue unmarked, editingRow sigue null)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      vm.enterEditing(5);

      expect(vm.rowState(5)).toBe('unmarked');
      expect(vm.editingRow()).toBeNull();
      vm.stop();
    });

    it('enterEditing(5) seguido de enterEditing(7) → 5 vuelve a locked, 7 pasa a editing', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 10 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C', '7': 'B' });
      const vm = createVm();
      await vm.start('sim-1');

      vm.enterEditing(5);
      expect(vm.editingRow()).toBe(5);

      vm.enterEditing(7);

      expect(vm.rowState(5)).toBe('locked');
      expect(vm.rowState(7)).toBe('editing');
      expect(vm.editingRow()).toBe(7);
      vm.stop();
    });

    it('tras EDITING_AUTO_LOCK_MS (5000ms) sin acción, la fila editing vuelve a locked automáticamente', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      vi.useFakeTimers();
      const vm = createVm();
      await vm.start('sim-1');

      vm.enterEditing(5);
      expect(vm.rowState(5)).toBe('editing');

      // 4999ms: aún en editing.
      vi.advanceTimersByTime(4_999);
      expect(vm.rowState(5)).toBe('editing');

      // 1ms más completa los 5s → auto-lock.
      vi.advanceTimersByTime(1);
      expect(vm.rowState(5)).toBe('locked');
      expect(vm.editingRow()).toBeNull();
      vm.stop();
    });

    it('enterEditing(5) + marcar(5, A) con A!=C → locked con A, y el timer de auto-lock fue cancelado', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      vi.useFakeTimers();
      const vm = createVm();
      await vm.start('sim-1');

      vm.enterEditing(5);
      await vm.marcar(5, 'A');

      expect(vm.marcaciones()['5']).toBe('A');
      expect(vm.rowState(5)).toBe('locked');
      expect(vm.editingRow()).toBeNull();

      // Avanzar 5s no debería disparar nada extra: el timer ya fue cancelado.
      vi.advanceTimersByTime(5_000);
      expect(vm.rowState(5)).toBe('locked');
      expect(vm.editingRow()).toBeNull();
      vm.stop();
    });

    it('enterEditing(5) + marcar(5, C) (misma actual) → fila pasa a unmarked (toggle off)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      const vm = createVm();
      await vm.start('sim-1');

      vm.enterEditing(5);
      await vm.marcar(5, 'C');

      expect(vm.marcaciones()['5']).toBeNull();
      expect(vm.rowState(5)).toBe('unmarked');
      expect(vm.editingRow()).toBeNull();
      vm.stop();
    });

    it('marcar(5, B) sobre fila locked → no invoca use case, marcación NO cambia ni dispara ningún hint signal', async () => {
      // Spec: exam-marking — scenario "Tap simple en burbuja de fila bloqueada
      // no cambia la marca". El feedback es la propia ausencia de cambio;
      // el chip "Toca para cambiar" aparece solo cuando rowState === 'editing'
      // (activado por long-press, no por tap simple sobre locked).
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'A' });
      const vm = createVm();
      await vm.start('sim-1');

      expect(vm.rowState(5)).toBe('locked');

      await vm.marcar(5, 'B');

      expect(fakeMarcar.calls).toHaveLength(0);
      expect(vm.marcaciones()['5']).toBe('A');
      expect(vm.rowState(5)).toBe('locked');
      // El view-model ya no expone ningún signal de hint/toast: la única
      // señal de comunicación es el chip que aparece cuando rowState =
      // 'editing' (no entró acá), cubierto por los tests de enterEditing.
      vm.stop();
    });

    it('stop() con editingRow activo limpia el timer (avanzar 5s no causa side effects)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      vi.useFakeTimers();
      const vm = createVm();
      await vm.start('sim-1');

      vm.enterEditing(5);
      expect(vm.editingRow()).toBe(5);

      vm.stop();
      expect(vm.editingRow()).toBeNull();

      // Avanzar 5s: el timer fue cancelado, nada extra sucede.
      vi.advanceTimersByTime(5_000);
      expect(vm.editingRow()).toBeNull();
    });

    it('enterEditing() cuando stopped=true es no-op', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '5': 'C' });
      const vm = createVm();
      await vm.start('sim-1');

      vm.stop();
      // Tras stop(), editingRow está en null y los timers cancelados; un
      // enterEditing posterior no debe reabrir nada.
      vm.enterEditing(5);

      expect(vm.editingRow()).toBeNull();
    });

    it('recuperación al montar: filas con marcas previas reportan rowState=locked directamente', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'A', '4': 'D' });
      const vm = createVm();
      await vm.start('sim-1');

      // Las preguntas seedeadas vienen `locked` sin necesidad de tocar nada.
      expect(vm.rowState(2)).toBe('locked');
      expect(vm.rowState(4)).toBe('locked');
      // Las preguntas sin marca siguen unmarked.
      expect(vm.rowState(1)).toBe('unmarked');
      expect(vm.rowState(3)).toBe('unmarked');
      expect(vm.rowState(5)).toBe('unmarked');
      vm.stop();
    });
  });

  describe('ticker — expiración durante la sesión', () => {
    // Tras 9.7, el ticker se ABSTIENE de redirigir si hay un auto-envío
    // vivo (autoEnvioHandle !== null). Esto previene el race contra el
    // setTimeout del auto-envío. Los tests reflejan esta coordinación.

    it('con auto-envío vivo, el ticker NO redirige aunque now >= fin (deja que el handle dispare)', async () => {
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

      // El auto-envío sigue vivo (handle no nullificado); el ticker debe
      // abstenerse aunque crucemos `fin`.
      fakeClock.setNow(new Date(fin.getTime()));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(vm.errorState()).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalled();
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

  describe('ticker — expiración cuando no hay auto-envío vivo (ya disparó queued)', () => {
    it('tras un auto-envío que terminó queued, el ticker se sigue absteniendo (submissionState=queued)', async () => {
      const inicio = new Date('2026-06-11T10:00:00Z');
      const fin = new Date('2026-06-11T10:00:05Z');
      fakeClock.setNow(inicio);
      const sim = buildSimulacro('sim-1', 'abierto', { inicio, fin });
      fakeObtener.willResolve([sim]);

      vi.useFakeTimers();
      const vm = createVm();
      await vm.start('sim-1');

      // El auto-envío disparó y terminó en queued (sin red).
      fakeProgramar.fireOnResult({
        status: 'queued',
        clientSubmittedAt: fin.toISOString(),
      });
      expect(vm.submissionState()).toBe('queued');

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fakeClock.setNow(new Date(fin.getTime() + 5_000));
      await vi.advanceTimersByTimeAsync(1_000);

      // El ticker se abstiene cuando submissionState=queued: el banner
      // debe seguir visible y el alumno decide cuándo volver.
      expect(vm.errorState()).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('tras un auto-envío exitoso, el handle queda null y submissionState=sent (ya navegó)', async () => {
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

      fakeProgramar.fireOnResult({
        status: 'enviado',
        clientSubmittedAt: fin.toISOString(),
      });

      expect(vm.submissionState()).toBe('sent');
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

  describe('submit() — envío manual', () => {
    const seededOk = (): EnviarSimulacroOutput => ({
      status: 'enviado',
      clientSubmittedAt: '2026-06-11T10:30:00.000Z',
    });
    const seededQueued = (): EnviarSimulacroOutput => ({
      status: 'queued',
      clientSubmittedAt: '2026-06-11T10:30:00.000Z',
    });

    it('éxito (status enviado) → submissionState=sent y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willResolve(seededOk());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(fakeEnviar.calls).toEqual([{ simulacroId: 'sim-1' }]);
      expect(vm.submissionState()).toBe('sent');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      expect(vm.isSubmitting()).toBe(false);
      vm.stop();
    });

    it('queued (sin red) → submissionState=queued y NO navega', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willResolve(seededQueued());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(vm.submissionState()).toBe('queued');
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(vm.isSubmitting()).toBe(false);
      vm.stop();
    });

    it('SimulacroCerradoError → errorState=cerrado y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willReject(new SimulacroCerradoError());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(vm.errorState()).toBe('cerrado');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('SimulacroNoAsignadoError → errorState=not-found y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willReject(new SimulacroNoAsignadoError());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(vm.errorState()).toBe('not-found');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('InvalidSubmissionTimeError → errorState=invalid-submission-time y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willReject(new InvalidSubmissionTimeError());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(vm.errorState()).toBe('invalid-submission-time');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('InvalidPayloadError → errorState=invalid-payload y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willReject(new InvalidPayloadError());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(vm.errorState()).toBe('invalid-payload');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('SessionExpiredError → errorState=session-expired y navigate /login', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willReject(new SessionExpiredError());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(vm.errorState()).toBe('session-expired');
      expect(navigateSpy).toHaveBeenCalledWith(['/login']);
      vm.stop();
    });

    it('NetworkError (defensa: no debería llegar acá) → errorState=network y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      fakeEnviar.willReject(new NetworkError());
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await vm.submit();

      expect(vm.errorState()).toBe('network');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('doble click: la segunda invocación NO dispara un segundo POST mientras la primera está en vuelo', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');
      const ctrl = fakeEnviar.willStayPending();

      const first = vm.submit();
      // Segunda invocación: aún hay una en vuelo (isSubmitting=true).
      const second = vm.submit();

      // Hasta acá: SOLO una llamada al use case.
      expect(fakeEnviar.calls).toHaveLength(1);

      // Resolvemos la primera.
      ctrl.resolve({
        status: 'enviado',
        clientSubmittedAt: '2026-06-11T10:30:00.000Z',
      });
      await first;
      await second;

      // Ambas resueltas, pero el use case se invocó UNA sola vez.
      expect(fakeEnviar.calls).toHaveLength(1);
      vm.stop();
    });

    it('submit() cancela el auto-envío programado al entrar', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      // Se programó un auto-envío al cargar.
      expect(fakeProgramar.calls).toHaveLength(1);
      expect(fakeProgramar.cancelCalls).toBe(0);

      fakeEnviar.willResolve({
        status: 'enviado',
        clientSubmittedAt: '2026-06-11T10:30:00.000Z',
      });
      await vm.submit();

      // submit() invocó cancel() en el handle del auto-envío.
      expect(fakeProgramar.cancelCalls).toBe(1);
      vm.stop();
    });
  });

  describe('auto-envío disparado por el timer', () => {
    it('onResult con status enviado → submissionState=sent y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      expect(fakeProgramar.calls).toHaveLength(1);
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      // Simulamos que el timer disparó y enviar fue exitoso.
      fakeProgramar.fireOnResult({
        status: 'enviado',
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      expect(vm.submissionState()).toBe('sent');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });

    it('onResult con status queued → submissionState=queued y NO navega', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fakeProgramar.fireOnResult({
        status: 'queued',
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      expect(vm.submissionState()).toBe('queued');
      expect(navigateSpy).not.toHaveBeenCalled();
      vm.stop();
    });

    it('onError SimulacroCerradoError → errorState=cerrado y navigate /home', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      const vm = createVm();
      await vm.start('sim-1');

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fakeProgramar.fireOnError(new SimulacroCerradoError());

      expect(vm.errorState()).toBe('cerrado');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      vm.stop();
    });
  });
});
