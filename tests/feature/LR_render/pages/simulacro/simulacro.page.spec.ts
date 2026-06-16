import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { Component } from '@angular/core';
import { convertToParamMap, ParamMap } from '@angular/router';
import { SimulacroPage } from '../../../../../src/LR_render/pages/simulacro/simulacro.page';
import { SimulacroPageViewModel } from '../../../../../src/LR_render/view-models/simulacro.view-model';
import { GetTodaysExamsUseCase } from '../../../../../src/L2_application/use-cases/get-todays-exams.use-case';
import { MarcarRespuestaUseCase } from '../../../../../src/L2_application/use-cases/marcar-respuesta.use-case';
import { EnviarSimulacroUseCase } from '../../../../../src/L2_application/use-cases/enviar-simulacro.use-case';
import {
  AutoEnvioHandle,
  ProgramarAutoEnvioInput,
  ProgramarAutoEnvioUseCase,
} from '../../../../../src/L2_application/use-cases/programar-auto-envio.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../../../../src/app.config';
import { Exam } from '../../../../../src/L1_domain/entities/exam';
import { ExamServerStatus } from '../../../../../src/L1_domain/value-objects/exam-server-status';
import { ServerTime } from '../../../../../src/L1_domain/value-objects/server-time';
import { Alternativa } from '../../../../../src/L1_domain/value-objects/alternativa';
import { Clock } from '../../../../../src/L1_domain/ports/clock';
import {
  AlternativaValue,
  AnswersMap,
  EnvioPendiente,
  MarkingsStorage,
} from '../../../../../src/L1_domain/ports/markings-storage';

@Component({ template: '' })
class HomeStub {}

class FakeGetTodaysExamsUseCase {
  private next: { kind: 'resolve'; list: readonly Exam[] } | { kind: 'reject'; error: Error } = {
    kind: 'resolve',
    list: [],
  };

  willResolve(list: readonly Exam[]) {
    this.next = { kind: 'resolve', list };
  }
  willReject(error: Error) {
    this.next = { kind: 'reject', error };
  }

  async execute(): Promise<readonly Exam[]> {
    if (this.next.kind === 'reject') throw this.next.error;
    return this.next.list;
  }
}

class FakeMarcarRespuestaUseCase {
  public calls: { examId: string; pregunta: number; alternativa: AlternativaValue }[] = [];

  constructor(private readonly markings: MarkingsStorage) {}

  async execute(input: {
    examId: string;
    pregunta: number;
    alternativa: Alternativa;
  }): Promise<void> {
    this.calls.push({
      examId: input.examId,
      pregunta: input.pregunta,
      alternativa: input.alternativa.value,
    });
    await this.markings.setMarcacion(input.examId, input.pregunta, input.alternativa.value);
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

  seedMarcaciones(examId: string, answers: AnswersMap): void {
    this.store.set(examId, { ...answers });
  }

  async setMarcacion(
    examId: string,
    pregunta: number,
    alternativa: AlternativaValue,
  ): Promise<void> {
    const existing = this.store.get(examId) ?? {};
    existing[String(pregunta)] = alternativa;
    this.store.set(examId, existing);
  }
  async getMarcaciones(examId: string): Promise<AnswersMap> {
    return { ...(this.store.get(examId) ?? {}) };
  }
  async hasSubmittedAck(_examId: string): Promise<boolean> {
    return false;
  }
  async clearMarcaciones(_examId: string): Promise<void> {
    /* no-op */
  }
  async enqueueEnvio(_envio: EnvioPendiente): Promise<void> {
    /* no-op */
  }
  async getEnviosPendientes(): Promise<EnvioPendiente[]> {
    return [];
  }
  async dequeueEnvio(_examId: string): Promise<void> {
    /* no-op */
  }
  async wipeUserScope(): Promise<void> {
    /* no-op */
  }
}

const buildActivatedRouteStub = (id: string | null): Partial<ActivatedRoute> => {
  const params: Record<string, string> = id !== null ? { id } : {};
  const paramMap: ParamMap = convertToParamMap(params);
  return {
    snapshot: {
      paramMap,
    } as unknown as ActivatedRoute['snapshot'],
  };
};

const flushPromises = async (iterations = 5): Promise<void> => {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
};

const buildExam = (
  id: string,
  serverStatusValue: 'scheduled' | 'in_progress' | 'finalized',
  overrides: Partial<{ count: number; scheduled: Date; started: Date | null; name: string }> = {},
): Exam => {
  const inProgress = serverStatusValue === 'in_progress';
  const finalized = serverStatusValue === 'finalized';
  return new Exam({
    id,
    area: 'Matemática',
    course: 'Aritmética',
    type: 'simulacro',
    name: overrides.name ?? `Examen ${id}`,
    count: overrides.count ?? 5,
    duration: 7200,
    scheduled: overrides.scheduled ?? new Date('2026-06-11T10:00:00Z'),
    started:
      'started' in overrides
        ? overrides.started ?? null
        : inProgress || finalized
          ? new Date('2026-06-11T10:00:05Z')
          : null,
    finished: finalized ? new Date('2026-06-11T12:00:00Z') : null,
    serverStatus: new ExamServerStatus(serverStatusValue),
  });
};

describe('SimulacroPage', () => {
  let fakeGetTodaysExams: FakeGetTodaysExamsUseCase;
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
        { provide: GetTodaysExamsUseCase, useValue: fakeGetTodaysExams },
        { provide: MarcarRespuestaUseCase, useValue: fakeMarcar },
        { provide: EnviarSimulacroUseCase, useValue: new FakeEnviarSimulacroUseCase() },
        { provide: ProgramarAutoEnvioUseCase, useValue: new FakeProgramarAutoEnvioUseCase() },
        { provide: CLOCK, useValue: fakeClock },
        { provide: MARKINGS_STORAGE, useValue: fakeMarkings },
      ],
    }).compileComponents();
  };

  beforeEach(() => {
    fakeGetTodaysExams = new FakeGetTodaysExamsUseCase();
    fakeClock = new FakeClock();
    fakeMarkings = new FakeMarkingsStorage();
    fakeMarcar = new FakeMarcarRespuestaUseCase(fakeMarkings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('render — exam in_progress', () => {
    it('muestra el name del exam, el countdown y count filas con 5 bubbles cada una', async () => {
      const exam = buildExam('exam-1', 'in_progress', {
        count: 4,
        name: 'Examen Demo',
      });
      fakeGetTodaysExams.willResolve([exam]);
      await configureTestBed('exam-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.header__name')?.textContent).toContain('Examen Demo');
      expect(el.querySelector('[role="timer"]')).not.toBeNull();
      expect(el.querySelector('.header__restante')).not.toBeNull();

      const filas = el.querySelectorAll('.fila');
      expect(filas.length).toBe(4);
      filas.forEach((fila) => {
        expect(fila.querySelectorAll('.bubble').length).toBe(5);
      });
    });

    it('refleja marcaciones pre-existentes en las bubbles', async () => {
      const exam = buildExam('exam-1', 'in_progress', { count: 5 });
      fakeGetTodaysExams.willResolve([exam]);
      fakeMarkings.seedMarcaciones('exam-1', { '2': 'C' });
      await configureTestBed('exam-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const filas = el.querySelectorAll('.fila');
      const bubblesFila2 = filas[1].querySelectorAll('.bubble');
      expect(bubblesFila2[2].classList.contains('bubble--marked')).toBe(true);
      expect(bubblesFila2[2].getAttribute('aria-checked')).toBe('true');
      expect(bubblesFila2[0].classList.contains('bubble--marked')).toBe(false);
    });
  });

  describe('marcar una bubble', () => {
    it('click en una bubble dispara MarcarRespuestaUseCase con (examId, pregunta, letra)', async () => {
      const exam = buildExam('exam-1', 'in_progress', { count: 3 });
      fakeGetTodaysExams.willResolve([exam]);
      await configureTestBed('exam-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const filas = el.querySelectorAll('.fila');
      const bubble = filas[1].querySelectorAll('.bubble')[1] as HTMLButtonElement;
      bubble.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        examId: 'exam-1',
        pregunta: 2,
        alternativa: 'B',
      });

      expect(bubble.classList.contains('bubble--marked')).toBe(true);
    });
  });

  describe('botón Volver', () => {
    it('navega a /home cuando se hace click', async () => {
      const exam = buildExam('exam-1', 'in_progress');
      fakeGetTodaysExams.willResolve([exam]);
      await configureTestBed('exam-1');

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

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      TestBed.createComponent(SimulacroPage);

      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
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
  // -----------------------------------------------------------------------
  describe('long-press y protección de filas (gestos)', () => {
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
        delete (navigator as unknown as { vibrate?: unknown }).vibrate;
      }
    });

    it('long-press 500ms en fila locked → entra a editing y muestra chip', async () => {
      const exam = buildExam('exam-1', 'in_progress', { count: 3 });
      fakeGetTodaysExams.willResolve([exam]);
      fakeMarkings.seedMarcaciones('exam-1', { '2': 'C' });
      await configureTestBed('exam-1');

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
        vi.advanceTimersByTime(500);
        firePointerEvent(fila2, 'pointerup', 100, 200);

        fixture.detectChanges();

        expect(fila2.classList.contains('fila--editing')).toBe(true);
        expect(fila2.classList.contains('fila--locked')).toBe(false);
        expect(fila2.querySelector('.row__chip')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('click en bubble de fila locked → NO aplica la marca', async () => {
      const exam = buildExam('exam-1', 'in_progress', { count: 3 });
      fakeGetTodaysExams.willResolve([exam]);
      fakeMarkings.seedMarcaciones('exam-1', { '2': 'A' });
      await configureTestBed('exam-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const filas = el.querySelectorAll('.fila');
      const fila2 = filas[1] as HTMLElement;
      const bubbleB = fila2.querySelectorAll('.bubble')[1] as HTMLButtonElement;
      bubbleB.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeMarcar.calls).toHaveLength(0);
      const bubbleA = fila2.querySelectorAll('.bubble')[0] as HTMLButtonElement;
      expect(bubbleA.classList.contains('bubble--marked')).toBe(true);
      expect(bubbleB.classList.contains('bubble--marked')).toBe(false);
      expect(el.querySelector('.row__chip')).toBeNull();
    });

    it('click en bubble de fila editing → aplica la marca y la fila vuelve a locked', async () => {
      const exam = buildExam('exam-1', 'in_progress', { count: 3 });
      fakeGetTodaysExams.willResolve([exam]);
      fakeMarkings.seedMarcaciones('exam-1', { '2': 'A' });
      await configureTestBed('exam-1');

      const fixture = TestBed.createComponent(SimulacroPage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const fila2 = el.querySelectorAll('.fila')[1] as HTMLElement;

      const pageVm = fixture.debugElement.injector.get(SimulacroPageViewModel);
      pageVm.enterEditing(2);
      fixture.detectChanges();

      expect(fila2.classList.contains('fila--editing')).toBe(true);

      const bubbleC = fila2.querySelectorAll('.bubble')[2] as HTMLButtonElement;
      bubbleC.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeMarcar.calls).toHaveLength(1);
      expect(fakeMarcar.calls[0]).toEqual({
        examId: 'exam-1',
        pregunta: 2,
        alternativa: 'C',
      });
      expect(fila2.classList.contains('fila--editing')).toBe(false);
      expect(fila2.classList.contains('fila--locked')).toBe(true);
      expect(bubbleC.classList.contains('bubble--marked')).toBe(true);
    });

    it('al entrar a edición vía long-press, navigator.vibrate se llama con [40]', async () => {
      const exam = buildExam('exam-1', 'in_progress', { count: 3 });
      fakeGetTodaysExams.willResolve([exam]);
      fakeMarkings.seedMarcaciones('exam-1', { '2': 'C' });
      await configureTestBed('exam-1');

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
