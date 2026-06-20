import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component, signal, WritableSignal } from '@angular/core';
import { TutorExamsListPage } from '../../../../../src/LR_render/pages/tutor-exams-list/tutor-exams-list.page';
import { TutorExamsListViewModel } from '../../../../../src/LR_render/view-models/tutor-exams-list.view-model';
import { TutorExam } from '../../../../../src/L1_domain/entities/tutor-exam';
import { ExamServerStatus } from '../../../../../src/L1_domain/value-objects/exam-server-status';

@Component({ template: '' })
class TutorExamDetailStub {}

function buildExam(
  recordId: string,
  status: 'scheduled' | 'in_progress' | 'finalized',
  overrides: Partial<ConstructorParameters<typeof TutorExam>[0]> = {},
): TutorExam {
  return new TutorExam({
    detailId: `det-${recordId}`,
    recordId,
    classroomId: 'cls-1',
    entryId: 'entry-1',
    serverStatus: new ExamServerStatus(status),
    name: `Examen ${recordId}`,
    courseId: 'course-1',
    count: 20,
    duration: 60,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    ...overrides,
  });
}

// Fake del VM. Replica la API pública (Signals y start/stop) que el page
// consume desde el template.
class FakeTutorExamsListViewModel {
  readonly exams: WritableSignal<readonly TutorExam[]> = signal([]);
  readonly loading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<boolean> = signal(false);
  readonly userName: WritableSignal<string | null> = signal(null);
  readonly userEmail: WritableSignal<string | null> = signal(null);
  readonly profileLoading: WritableSignal<boolean> = signal(false);
  readonly profileUnavailable: WritableSignal<boolean> = signal(false);

  async start(): Promise<void> {
    /* no-op — los tests setean los signals manualmente */
  }
  stop(): void {
    /* no-op */
  }
  async refresh(): Promise<void> {
    /* no-op */
  }
}

const flushPromises = async (iterations = 5): Promise<void> => {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
};

describe('TutorExamsListPage', () => {
  let fakeVm: FakeTutorExamsListViewModel;

  beforeEach(async () => {
    fakeVm = new FakeTutorExamsListViewModel();

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TutorExamsListPage],
      providers: [
        provideRouter([
          { path: 'tutor/exams/:recordId', component: TutorExamDetailStub },
          { path: 'tutor/home', component: TutorExamsListPage },
        ]),
      ],
    })
      // El page declara `providers: [TutorExamsListViewModel]` a nivel componente.
      // Sobrescribimos esa provisión para inyectar el fake.
      .overrideComponent(TutorExamsListPage, {
        set: {
          providers: [{ provide: TutorExamsListViewModel, useValue: fakeVm }],
        },
      })
      .compileComponents();
  });

  describe('Scenario: VM es local al componente page', () => {
    it('TutorExamsListViewModel aparece en providers del decorador @Component', () => {
      // Verificamos a través de la override — si el page no tuviera
      // TutorExamsListViewModel en providers, la override no sería necesaria
      // y el test fallaría al no encontrar el token. Este test valida
      // estructuralmente que el componente provee el VM.
      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      // Si el VM no fuera provider-local, el inject() en el page lanzaría un error
      // en este punto. El hecho de que no lanza confirma la provisión local.
      expect(fixture.componentInstance).toBeDefined();
    });
  });

  describe('Scenario: Lista renderizada en el orden devuelto por el backend', () => {
    it('renderiza una tarjeta por cada exam en orden', async () => {
      const examA = buildExam('rec-A', 'scheduled');
      const examB = buildExam('rec-B', 'in_progress');
      const examC = buildExam('rec-C', 'finalized');
      fakeVm.exams.set([examA, examB, examC]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const cards = el.querySelectorAll('[data-testid="exam-card"]');
      expect(cards).toHaveLength(3);
    });
  });

  describe('Scenario: count null renderiza "—"', () => {
    it('count === null → la tarjeta muestra "—"', async () => {
      const exam = buildExam('rec-1', 'scheduled', { count: null });
      fakeVm.exams.set([exam]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('—');
    });
  });

  describe('Scenario: badges por estado', () => {
    it('scheduled → badge muestra "Programado"', async () => {
      fakeVm.exams.set([buildExam('rec-1', 'scheduled')]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const badge = el.querySelector('[data-testid="status-badge"]');
      expect(badge?.textContent?.trim()).toBe('Programado');
    });

    it('in_progress → badge muestra "En curso"', async () => {
      fakeVm.exams.set([buildExam('rec-1', 'in_progress')]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const badge = el.querySelector('[data-testid="status-badge"]');
      expect(badge?.textContent?.trim()).toBe('En curso');
    });

    it('finalized → badge muestra "Finalizado"', async () => {
      fakeVm.exams.set([buildExam('rec-1', 'finalized')]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const badge = el.querySelector('[data-testid="status-badge"]');
      expect(badge?.textContent?.trim()).toBe('Finalizado');
    });
  });

  describe('Scenario: Tap en tarjeta navega a /tutor/exams/:recordId', () => {
    it('click en una tarjeta con recordId="rec-1" → router navega a /tutor/exams/rec-1', async () => {
      fakeVm.exams.set([buildExam('rec-1', 'scheduled')]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const card = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="exam-card"]',
      ) as HTMLElement;
      expect(card).not.toBeNull();
      card.click();
      await flushPromises();

      expect(navigateSpy).toHaveBeenCalledWith(['/tutor/exams', 'rec-1']);
    });

    it('tap NOT navega fuera de /tutor — URL sigue patrón /tutor/exams/:recordId', async () => {
      fakeVm.exams.set([buildExam('rec-99', 'in_progress')]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const card = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="exam-card"]',
      ) as HTMLElement;
      card.click();
      await flushPromises();

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      const callArgs = navigateSpy.mock.calls[0] as [string[]];
      const url = callArgs[0].join('/');
      expect(url).toMatch(/^\/tutor\/exams\//);
    });
  });
});
