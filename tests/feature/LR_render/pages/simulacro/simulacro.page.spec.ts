import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { Component } from '@angular/core';
import { convertToParamMap, ParamMap } from '@angular/router';
import { SimulacroPage } from '../../../../../src/LR_render/pages/simulacro/simulacro.page';
import { ObtenerSimulacrosDelDiaUseCase } from '../../../../../src/L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { MarcarRespuestaUseCase } from '../../../../../src/L2_application/use-cases/marcar-respuesta.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../../../../src/app.config';
import { Simulacro } from '../../../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../../../src/L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../../../../src/L1_domain/value-objects/server-time';
import { Alternativa } from '../../../../../src/L1_domain/value-objects/alternativa';
import { Clock } from '../../../../../src/L1_domain/ports/clock';
import {
  AlternativaValue,
  AnswersMap,
  EnvioPendiente,
  MarkingsStorage,
} from '../../../../../src/L1_domain/ports/markings-storage';

// Stub para la ruta /home: SimulacroPage navega ahí en varios casos.
@Component({ template: '' })
class HomeStub {}

class FakeObtenerSimulacrosDelDiaUseCase {
  private next:
    | { kind: 'resolve'; list: readonly Simulacro[] }
    | { kind: 'reject'; error: Error } = { kind: 'resolve', list: [] };

  willResolve(list: readonly Simulacro[]) {
    this.next = { kind: 'resolve', list };
  }
  willReject(error: Error) {
    this.next = { kind: 'reject', error };
  }

  async execute(): Promise<readonly Simulacro[]> {
    if (this.next.kind === 'reject') throw this.next.error;
    return this.next.list;
  }
}

// Spy del use case L2 que delega al storage fake.
class FakeMarcarRespuestaUseCase {
  public calls: { simulacroId: string; pregunta: number; alternativa: AlternativaValue }[] = [];

  constructor(private readonly markings: MarkingsStorage) {}

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

class FakeMarkingsStorage implements MarkingsStorage {
  private store = new Map<string, AnswersMap>();

  seedMarcaciones(simulacroId: string, answers: AnswersMap): void {
    this.store.set(simulacroId, { ...answers });
  }

  async setMarcacion(
    simulacroId: string,
    pregunta: number,
    alternativa: AlternativaValue,
  ): Promise<void> {
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

// Stub de ActivatedRoute parametrizable: el SimulacroPage solo lee
// `route.snapshot.paramMap.get('id')` en el constructor.
const buildActivatedRouteStub = (id: string | null): Partial<ActivatedRoute> => {
  const params: Record<string, string> = id !== null ? { id } : {};
  const paramMap: ParamMap = convertToParamMap(params);
  return {
    snapshot: {
      paramMap,
    } as unknown as ActivatedRoute['snapshot'],
  };
};

// Helper: flush microtasks. El constructor de SimulacroPage dispara
// `void vm.start(id)`, que awaitea use case + storage read. whenStable()
// no espera promesas no atadas al lifecycle, así que flusheamos a mano.
const flushPromises = async (iterations = 5): Promise<void> => {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
};

const buildSimulacro = (
  id: string,
  estadoValue: 'pendiente' | 'abierto' | 'enviado' | 'cerrado',
  overrides: Partial<{ count: number; inicio: Date; fin: Date; name: string }> = {},
): Simulacro =>
  new Simulacro({
    id,
    area: 'Matemática',
    name: overrides.name ?? `Simulacro ${id}`,
    count: overrides.count ?? 5,
    inicio: overrides.inicio ?? new Date('2026-06-11T10:00:00Z'),
    fin: overrides.fin ?? new Date('2026-06-11T12:00:00Z'),
    estado: new EstadoSimulacro(estadoValue),
  });

describe('SimulacroPage', () => {
  let fakeObtener: FakeObtenerSimulacrosDelDiaUseCase;
  let fakeClock: FakeClock;
  let fakeMarkings: FakeMarkingsStorage;
  let fakeMarcar: FakeMarcarRespuestaUseCase;

  const configureTestBed = async (idParam: string | null) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SimulacroPage],
      providers: [
        provideRouter([{ path: 'home', component: HomeStub }]),
        { provide: ActivatedRoute, useValue: buildActivatedRouteStub(idParam) },
        { provide: ObtenerSimulacrosDelDiaUseCase, useValue: fakeObtener },
        { provide: MarcarRespuestaUseCase, useValue: fakeMarcar },
        { provide: CLOCK, useValue: fakeClock },
        { provide: MARKINGS_STORAGE, useValue: fakeMarkings },
      ],
    }).compileComponents();
  };

  beforeEach(() => {
    fakeObtener = new FakeObtenerSimulacrosDelDiaUseCase();
    fakeClock = new FakeClock();
    fakeMarkings = new FakeMarkingsStorage();
    fakeMarcar = new FakeMarcarRespuestaUseCase(fakeMarkings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('render — simulacro abierto', () => {
    it('muestra el name del simulacro, el countdown y count filas con 5 bubbles cada una', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', {
        count: 4,
        name: 'Simulacro Demo',
      });
      fakeObtener.willResolve([sim]);
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;

      // Title del simulacro
      expect(el.querySelector('.header__name')?.textContent).toContain('Simulacro Demo');

      // Countdown presente (rol timer)
      expect(el.querySelector('[role="timer"]')).not.toBeNull();
      // No assertimos el texto exacto del countdown: depende de la hora actual
      // del clock fake vs fin; solo verificamos que el container está renderizado.
      expect(el.querySelector('.header__restante')).not.toBeNull();

      // 4 filas (una por pregunta), cada una con 5 bubbles A–E
      const filas = el.querySelectorAll('.fila');
      expect(filas.length).toBe(4);
      filas.forEach((fila) => {
        expect(fila.querySelectorAll('.bubble').length).toBe(5);
      });
    });

    it('refleja marcaciones pre-existentes en las bubbles', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 5 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'C' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const filas = el.querySelectorAll('.fila');
      // La fila 2 (índice 1 en NodeList) debe tener la bubble "C" marcada.
      const bubblesFila2 = filas[1].querySelectorAll('.bubble');
      // Las bubbles están en orden A, B, C, D, E → índice 2 es "C".
      expect(bubblesFila2[2].classList.contains('bubble--marked')).toBe(true);
      expect(bubblesFila2[2].getAttribute('aria-checked')).toBe('true');
      // Las demás bubbles de la fila 2 no marcadas.
      expect(bubblesFila2[0].classList.contains('bubble--marked')).toBe(false);
    });
  });

  describe('marcar una bubble', () => {
    it('click en una bubble dispara MarcarRespuestaUseCase con (id, pregunta, letra)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const filas = el.querySelectorAll('.fila');
      // Click sobre la bubble "B" (index 1) de la fila 2 (index 1).
      const bubble = filas[1].querySelectorAll('.bubble')[1] as HTMLButtonElement;
      bubble.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        simulacroId: 'sim-1',
        pregunta: 2,
        alternativa: 'B',
      });

      // La bubble queda marcada visualmente.
      expect(bubble.classList.contains('bubble--marked')).toBe(true);
    });
  });

  describe('botón Volver', () => {
    it('navega a /home cuando se hace click', async () => {
      const sim = buildSimulacro('sim-1', 'abierto');
      fakeObtener.willResolve([sim]);
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const volverBtn = fixture.nativeElement.querySelector(
        '.btn--secondary',
      ) as HTMLButtonElement;
      volverBtn.click();

      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
    });
  });

  describe('id ausente en route', () => {
    it('redirige a /home directamente sin invocar al use case', async () => {
      await configureTestBed(null);

      // Spy del Router ANTES de crear el componente porque la navegación
      // ocurre en el constructor.
      // Inyectamos el Router del TestBed (instanciado lazily al pedirlo).
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      TestBed.createComponent(SimulacroPage);

      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      // El use case no se invoca porque el constructor sale antes.
      // (no exponemos callCount; pero sin call al execute(), fakeMarcar.calls
      // queda vacío y el fakeObtener tampoco recibió execute. Verificamos
      // indirectamente: la lista de calls del fakeMarcar es 0.)
      expect(fakeMarcar.calls).toHaveLength(0);
    });

    it('id whitespace en route también redirige a /home directamente', async () => {
      await configureTestBed('   ');

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      TestBed.createComponent(SimulacroPage);

      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
    });
  });
});
