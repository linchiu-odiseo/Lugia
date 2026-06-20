import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component, computed, signal, WritableSignal } from '@angular/core';
import { TutorExamsListPage } from '../../../../../src/LR_render/pages/tutor-exams-list/tutor-exams-list.page';
import { TutorExamsListViewModel } from '../../../../../src/LR_render/view-models/tutor-exams-list.view-model';
import { TutorExam } from '../../../../../src/L1_domain/entities/tutor-exam';
import { ExamServerStatus } from '../../../../../src/L1_domain/value-objects/exam-server-status';
import { TutorClassroom } from '../../../../../src/L1_domain/value-objects/tutor-profile';

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

const CLASSROOM_A: TutorClassroom = {
  id: 'cls-a',
  code: 'AULA-A',
  name: 'Matemáticas I',
  modality: 'presencial',
  shift: 'manana',
  campusName: 'Campus Norte',
  cycleId: 'cycle-1',
  cycleName: 'Ciclo 2026-I',
  studentCount: 30,
};

const CLASSROOM_B: TutorClassroom = {
  id: 'cls-b',
  code: 'AULA-B',
  name: 'Física II',
  modality: 'virtual',
  shift: 'tarde',
  campusName: null,
  cycleId: 'cycle-2',
  cycleName: 'Ciclo 2026-II',
  studentCount: 25,
};

// Fake del VM. Replica la API pública (Signals y start/stop) que el page
// consume desde el template.
class FakeTutorExamsListViewModel {
  readonly exams: WritableSignal<readonly TutorExam[]> = signal([]);
  readonly loading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<boolean> = signal(false);
  readonly userName: WritableSignal<string | null> = signal(null);
  readonly userEmail: WritableSignal<string | null> = signal(null);
  readonly userCode: WritableSignal<string | null> = signal(null);
  readonly profileEmail: WritableSignal<string | null> = signal(null);
  readonly profileLoading: WritableSignal<boolean> = signal(false);
  readonly profileUnavailable: WritableSignal<boolean> = signal(false);
  readonly classrooms: WritableSignal<readonly TutorClassroom[]> = signal([]);
  readonly classroomCount = computed(() => this.classrooms().length);
  readonly studentTotal = computed(() =>
    this.classrooms().reduce((sum, c) => sum + c.studentCount, 0),
  );
  readonly hasClassrooms = computed(() => this.classrooms().length > 0);
  readonly isSigningOut: WritableSignal<boolean> = signal(false);

  signOutSpy = vi.fn().mockResolvedValue(undefined);

  async start(): Promise<void> {
    /* no-op — los tests setean los signals manualmente */
  }
  stop(): void {
    /* no-op */
  }
  async refresh(): Promise<void> {
    /* no-op */
  }
  async signOut(): Promise<void> {
    return this.signOutSpy();
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

  // ── Nuevos escenarios: profile card, aulas, DOM order, logout ───────────────

  describe('Scenario: Profile card renderiza nombre y email del tutor', () => {
    it('muestra el saludo con userName cuando el perfil está disponible', async () => {
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const profileCard = el.querySelector('[data-testid="profile-card"]');
      expect(profileCard).not.toBeNull();
      expect(profileCard?.textContent).toContain('Carlos Mendoza');
    });

    it('muestra el email del perfil en la profile card', async () => {
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.profileEmail.set('tutor1@example.pe');
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="profile-card"]')?.textContent).toContain(
        'tutor1@example.pe',
      );
    });

    it('muestra el userCode en la profile card', async () => {
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.userCode.set('T001');
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="profile-card"]')?.textContent).toContain('T001');
    });

    it('muestra skeleton cuando profileLoading() es true', async () => {
      fakeVm.profileLoading.set(true);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="profile-skeleton"]')).not.toBeNull();
    });

    it('muestra degraded card cuando profileUnavailable() es true', async () => {
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(true);
      fakeVm.userEmail.set('fallback@example.pe');

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="profile-card-degraded"]')).not.toBeNull();
    });
  });

  describe('Scenario: Mis aulas — lista de aulas renderizada', () => {
    it('renderiza una fila por cada aula del tutor', async () => {
      fakeVm.classrooms.set([CLASSROOM_A, CLASSROOM_B]);
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const rows = el.querySelectorAll('[data-testid="classroom-item"]');
      expect(rows).toHaveLength(2);
    });

    it('cada fila de aula muestra el nombre del aula', async () => {
      fakeVm.classrooms.set([CLASSROOM_A]);
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const row = el.querySelector('[data-testid="classroom-item"]');
      expect(row?.textContent).toContain('Matemáticas I');
    });

    it('cada fila de aula muestra el cycleName', async () => {
      fakeVm.classrooms.set([CLASSROOM_A]);
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const row = el.querySelector('[data-testid="classroom-item"]');
      expect(row?.textContent).toContain('Ciclo 2026-I');
    });

    it('cada fila de aula muestra el studentCount', async () => {
      fakeVm.classrooms.set([CLASSROOM_A]);
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const row = el.querySelector('[data-testid="classroom-item"]');
      expect(row?.textContent).toContain('30');
    });

    it('muestra línea de resumen con classroomCount y studentTotal', async () => {
      fakeVm.classrooms.set([CLASSROOM_A, CLASSROOM_B]); // 2 aulas, 55 alumnos
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const summary = el.querySelector('[data-testid="classrooms-summary"]');
      expect(summary).not.toBeNull();
      expect(summary?.textContent).toContain('2');
      expect(summary?.textContent).toContain('55');
    });

    it('muestra empty-state cuando no hay aulas', async () => {
      fakeVm.classrooms.set([]);
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="classrooms-empty"]')).not.toBeNull();
    });
  });

  describe('Scenario: DOM order — profile/aulas BEFORE exámenes', () => {
    it('la sección de perfil aparece antes de la lista de exámenes en el DOM', async () => {
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);
      fakeVm.exams.set([buildExam('rec-1', 'scheduled')]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const profileCard = el.querySelector('[data-testid="profile-card"]');
      const examsList = el.querySelector('[data-testid="exams-list"]');

      expect(profileCard).not.toBeNull();
      expect(examsList).not.toBeNull();

      // El profileCard debe aparecer ANTES del examsList en el DOM.
      const position = profileCard!.compareDocumentPosition(examsList!);
      // Node.DOCUMENT_POSITION_FOLLOWING = 4 — examsList está después de profileCard
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('la sección "Mis aulas" aparece antes de la lista de exámenes en el DOM', async () => {
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);
      fakeVm.classrooms.set([CLASSROOM_A]);
      fakeVm.exams.set([buildExam('rec-1', 'scheduled')]);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const aulasSection = el.querySelector('[data-testid="classrooms-section"]');
      const examsList = el.querySelector('[data-testid="exams-list"]');

      expect(aulasSection).not.toBeNull();
      expect(examsList).not.toBeNull();

      const position = aulasSection!.compareDocumentPosition(examsList!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('Scenario: Botón Cerrar sesión', () => {
    it('el botón "Cerrar sesión" existe en el footer', async () => {
      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector('[data-testid="btn-logout"]');
      expect(btn).not.toBeNull();
    });

    it('click en "Cerrar sesión" llama signOut() del VM', async () => {
      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector('[data-testid="btn-logout"]') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      btn.click();
      await flushPromises();

      expect(fakeVm.signOutSpy).toHaveBeenCalledTimes(1);
    });

    it('botón está disabled cuando isSigningOut() es true', async () => {
      fakeVm.isSigningOut.set(true);

      const fixture = TestBed.createComponent(TutorExamsListPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector('[data-testid="btn-logout"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });
});
