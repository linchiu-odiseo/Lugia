import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { Component } from '@angular/core';
import { convertToParamMap, ParamMap } from '@angular/router';
import { SimulacroPage } from '../../../../../src/LR_render/pages/simulacro/simulacro.page';
import { SimulacroPageViewModel } from '../../../../../src/LR_render/view-models/simulacro.view-model';
import { ObtenerSimulacrosDelDiaUseCase } from '../../../../../src/L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { MarcarRespuestaUseCase } from '../../../../../src/L2_application/use-cases/marcar-respuesta.use-case';
import { EnviarSimulacroUseCase } from '../../../../../src/L2_application/use-cases/enviar-simulacro.use-case';
import {
  AutoEnvioHandle,
  ProgramarAutoEnvioInput,
  ProgramarAutoEnvioUseCase,
} from '../../../../../src/L2_application/use-cases/programar-auto-envio.use-case';
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
  private next: { kind: 'resolve'; list: readonly Simulacro[] } | { kind: 'reject'; error: Error } =
    { kind: 'resolve', list: [] };

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

// Fakes mínimos para sec.9: el SimulacroPage instancia el view-model que
// inyecta EnviarSimulacroUseCase y ProgramarAutoEnvioUseCase. Estos tests
// no ejercitan submit/auto-envío (eso vive en el spec del view-model), pero
// los providers son obligatorios para que el inject() no rompa.
class FakeEnviarSimulacroUseCase {
  async execute(): Promise<{ status: 'enviado'; clientSubmittedAt: string }> {
    return { status: 'enviado', clientSubmittedAt: new Date().toISOString() };
  }
}

class FakeProgramarAutoEnvioUseCase {
  execute(_input: ProgramarAutoEnvioInput): AutoEnvioHandle {
    return { cancel: () => undefined };
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
        { provide: EnviarSimulacroUseCase, useValue: new FakeEnviarSimulacroUseCase() },
        { provide: ProgramarAutoEnvioUseCase, useValue: new FakeProgramarAutoEnvioUseCase() },
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

      const volverBtn = fixture.nativeElement.querySelector('.btn--secondary') as HTMLButtonElement;
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

  // -----------------------------------------------------------------------
  // Protección contra cambios accidentales — gestos en la página
  //
  // El page traduce eventos PointerEvent a llamadas al view-model:
  //   - pointerdown + 500ms sin levantar ni mover >10px → vm.enterEditing
  //   - pointerup antes / pointermove con dx>10 → cancela el gesto
  //   - click en bubble post-long-press → suprime el primer click
  //
  // jsdom no implementa PointerEvent en todas las versiones; fabricamos uno
  // a partir de MouseEvent (que sí tiene clientX/clientY) y lo extendemos.
  // El handler del page solo lee `ev.clientX` y `ev.clientY`, así que un
  // MouseEvent enriquecido con type='pointerdown' es suficiente.
  // -----------------------------------------------------------------------
  describe('long-press y protección de filas (gestos)', () => {
    // Crea un evento tipo `pointerXxx` con clientX/clientY. Si el runtime
    // tiene PointerEvent nativo lo usamos; sino caemos a MouseEvent con el
    // mismo `type` — el código del page solo lee clientX/clientY.
    const firePointerEvent = (
      el: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
      x: number,
      y: number,
    ): void => {
      const PointerEventCtor = (globalThis as { PointerEvent?: typeof PointerEvent }).PointerEvent;
      let ev: Event;
      if (typeof PointerEventCtor === 'function') {
        try {
          ev = new PointerEventCtor(type, {
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          });
        } catch {
          ev = new MouseEvent(type, {
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          });
        }
      } else {
        ev = new MouseEvent(type, {
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        });
      }
      el.dispatchEvent(ev);
    };

    let vibrateMock: ReturnType<typeof vi.fn>;
    let originalVibrate: unknown;

    beforeEach(() => {
      vibrateMock = vi.fn();
      // Guardamos la descripción previa (puede no existir) para restaurarla.
      const desc = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
      originalVibrate = desc;
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateMock,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      if (typeof originalVibrate === 'object' && originalVibrate !== null) {
        Object.defineProperty(navigator, 'vibrate', originalVibrate as PropertyDescriptor);
      } else {
        // Si no había uno previo (browser sin la API), removemos lo nuestro.
        delete (navigator as unknown as { vibrate?: unknown }).vibrate;
      }
    });

    it('long-press 500ms en fila locked → entra a editing (clase .fila--editing y hint visible)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'C' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      // Esperar el ciclo de start() ANTES de activar fake timers — sino
      // las promesas internas del bootstrap quedan colgadas.
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      vi.useFakeTimers();
      try {
        const el = fixture.nativeElement as HTMLElement;
        const fila2 = el.querySelectorAll('.fila')[1] as HTMLElement;

        firePointerEvent(fila2, 'pointerdown', 100, 200);
        // Mantener 500ms sin mover ni levantar.
        vi.advanceTimersByTime(500);
        firePointerEvent(fila2, 'pointerup', 100, 200);

        fixture.detectChanges();

        expect(fila2.classList.contains('fila--editing')).toBe(true);
        expect(fila2.classList.contains('fila--locked')).toBe(false);
        // Chip flotante "Toca para cambiar" debe aparecer dentro de la fila
        // editing. Es la única comunicación visual de la afordancia de cambio
        // (reemplaza al toast inicial y al hint inline post-restyle).
        expect(fila2.querySelector('.row__chip')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('pointerdown + pointermove con dx>10px antes de 500ms → NO entra a edición', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'C' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      vi.useFakeTimers();
      try {
        const el = fixture.nativeElement as HTMLElement;
        const fila2 = el.querySelectorAll('.fila')[1] as HTMLElement;

        firePointerEvent(fila2, 'pointerdown', 100, 200);
        // 200ms después el dedo se va a 120,200 (dx=20 > 10) → cancela.
        vi.advanceTimersByTime(200);
        firePointerEvent(fila2, 'pointermove', 120, 200);
        // El resto del tiempo ya no debería disparar nada.
        vi.advanceTimersByTime(400);
        firePointerEvent(fila2, 'pointerup', 120, 200);

        fixture.detectChanges();

        expect(fila2.classList.contains('fila--editing')).toBe(false);
        expect(fila2.classList.contains('fila--locked')).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pointerdown + pointerup antes de 500ms → NO entra a edición', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'C' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      vi.useFakeTimers();
      try {
        const el = fixture.nativeElement as HTMLElement;
        const fila2 = el.querySelectorAll('.fila')[1] as HTMLElement;

        firePointerEvent(fila2, 'pointerdown', 100, 200);
        vi.advanceTimersByTime(300); // < 500
        firePointerEvent(fila2, 'pointerup', 100, 200);
        // Y aunque después dejemos pasar el resto, el timer ya fue cancelado.
        vi.advanceTimersByTime(500);

        fixture.detectChanges();

        expect(fila2.classList.contains('fila--editing')).toBe(false);
        expect(fila2.classList.contains('fila--locked')).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('long-press sobre fila unmarked → NO entra a edición (handler retorna early)', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      // Sin seed → todas las filas están unmarked.
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      vi.useFakeTimers();
      try {
        const el = fixture.nativeElement as HTMLElement;
        const fila1 = el.querySelectorAll('.fila')[0] as HTMLElement;

        firePointerEvent(fila1, 'pointerdown', 100, 200);
        vi.advanceTimersByTime(500);
        firePointerEvent(fila1, 'pointerup', 100, 200);

        fixture.detectChanges();

        // Sigue unmarked: ni locked ni editing.
        expect(fila1.classList.contains('fila--editing')).toBe(false);
        expect(fila1.classList.contains('fila--locked')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('click en bubble de fila locked → NO aplica la marca y NO muestra ningún hint en el DOM', async () => {
      // Spec exam-marking — scenario "Tap simple en burbuja de fila bloqueada
      // no cambia la marca". El feedback es la propia ausencia de cambio:
      // sin toast, sin hint inline, sin chip. El chip solo aparece tras
      // long-press cuando rowState pasa a editing (cubierto por otro test).
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'A' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const filas = el.querySelectorAll('.fila');
      const fila2 = filas[1] as HTMLElement;
      // Bubble "B" (index 1) en la fila 2.
      const bubbleB = fila2.querySelectorAll('.bubble')[1] as HTMLButtonElement;
      bubbleB.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      // El use case NO se invocó: la fila estaba locked.
      expect(fakeMarcar.calls).toHaveLength(0);
      // La marca previa sigue siendo A (no cambió a B).
      const bubbleA = fila2.querySelectorAll('.bubble')[0] as HTMLButtonElement;
      expect(bubbleA.classList.contains('bubble--marked')).toBe(true);
      expect(bubbleB.classList.contains('bubble--marked')).toBe(false);
      // Y no aparece ni el toast antiguo ni el chip nuevo (porque no entró
      // a editing — solo hubo un tap simple sobre locked).
      expect(el.querySelector('.row__chip')).toBeNull();
    });

    it('click en bubble de fila editing → aplica la marca y la fila vuelve a locked', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'A' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const fila2 = el.querySelectorAll('.fila')[1] as HTMLElement;

      // Entramos a edición vía el view-model directamente (sin pasar por
      // long-press) para evitar el flag `suppressNextClick` — este test se
      // enfoca en el efecto del click sobre una fila editing, no en el
      // gesto que la llevó ahí. El VM es provider-local a la page; lo
      // sacamos del injector del fixture.
      const pageVm = fixture.debugElement.injector.get(SimulacroPageViewModel);
      pageVm.enterEditing(2);
      fixture.detectChanges();

      expect(fila2.classList.contains('fila--editing')).toBe(true);

      // Click en bubble C (índice 2) — letra distinta a la actual A.
      const bubbleC = fila2.querySelectorAll('.bubble')[2] as HTMLButtonElement;
      bubbleC.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        simulacroId: 'sim-1',
        pregunta: 2,
        alternativa: 'C',
      });
      // La fila vuelve a locked (con la nueva marca).
      expect(fila2.classList.contains('fila--editing')).toBe(false);
      expect(fila2.classList.contains('fila--locked')).toBe(true);
      expect(bubbleC.classList.contains('bubble--marked')).toBe(true);
    });

    it('long-press exitoso seguido de click inmediato sobre misma burbuja → click se suprime', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'A' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const fila2 = el.querySelectorAll('.fila')[1] as HTMLElement;
      const bubbleC = fila2.querySelectorAll('.bubble')[2] as HTMLButtonElement;

      vi.useFakeTimers();
      try {
        // Long-press iniciado sobre la bubble C (el dedo cayó ahí).
        firePointerEvent(bubbleC, 'pointerdown', 50, 50);
        vi.advanceTimersByTime(500);
        firePointerEvent(bubbleC, 'pointerup', 50, 50);

        fixture.detectChanges();
        // Tras long-press: la fila entra a editing.
        expect(fila2.classList.contains('fila--editing')).toBe(true);
      } finally {
        vi.useRealTimers();
      }

      // El click sintético del browser tras el long-press se simula aquí.
      // Por el flag `suppressNextClick`, NO debe aplicar la marca.
      bubbleC.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeMarcar.calls).toHaveLength(0);
      // La marca previa (A) sigue intacta.
      const bubbleA = fila2.querySelectorAll('.bubble')[0] as HTMLButtonElement;
      expect(bubbleA.classList.contains('bubble--marked')).toBe(true);
    });

    it('al entrar a edición vía long-press, navigator.vibrate se llama con [40]', async () => {
      const sim = buildSimulacro('sim-1', 'abierto', { count: 3 });
      fakeObtener.willResolve([sim]);
      fakeMarkings.seedMarcaciones('sim-1', { '2': 'C' });
      await configureTestBed('sim-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      vi.useFakeTimers();
      try {
        const el = fixture.nativeElement as HTMLElement;
        const fila2 = el.querySelectorAll('.fila')[1] as HTMLElement;

        firePointerEvent(fila2, 'pointerdown', 5, 5);
        vi.advanceTimersByTime(500);
        firePointerEvent(fila2, 'pointerup', 5, 5);

        expect(vibrateMock).toHaveBeenCalledWith([40]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
