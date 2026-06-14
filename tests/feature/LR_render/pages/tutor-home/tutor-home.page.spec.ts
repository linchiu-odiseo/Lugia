import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Component, signal, WritableSignal, computed } from '@angular/core';
import { TutorHomePage } from '../../../../../src/LR_render/pages/tutor-home/tutor-home.page';
import { TutorHomePageViewModel } from '../../../../../src/LR_render/view-models/tutor-home.view-model';
import { LogoutUseCase } from '../../../../../src/L2_application/use-cases/logout.use-case';

// Componente stub para que provideRouter no se queje cuando el page navega a /login.
@Component({ template: '' })
class LoginStub {}

// Fake del VM. Reproducimos la API pública (Signals y `start()`) que el page
// consume desde el template. Cada test ajusta los signals ANTES de crear el
// component para fijar el estado del render.
class FakeTutorHomePageViewModel {
  readonly userEmail: WritableSignal<string | null> = signal(null);
  readonly userName: WritableSignal<string | null> = signal(null);
  readonly userCode: WritableSignal<string | null> = signal(null);
  readonly profileEmail: WritableSignal<string | null> = signal(null);
  readonly classroomCount: WritableSignal<number> = signal(0);
  readonly studentTotal: WritableSignal<number> = signal(0);
  readonly profileLoading: WritableSignal<boolean> = signal(false);
  readonly profileUnavailable: WritableSignal<boolean> = signal(false);
  readonly errorMessage: WritableSignal<string | null> = signal(null);

  // Computed que el template consume — replican la lógica del VM real.
  readonly hasClassrooms = computed(() => this.classroomCount() > 0);
  readonly statsText = computed(() => {
    if (!this.hasClassrooms()) return null;
    return `Tenés ${this.classroomCount()} aulas · ${this.studentTotal()} alumnos`;
  });

  // start() es no-op porque los tests sembran los signals antes del render.
  async start(): Promise<void> {
    /* no-op — los tests setean los signals manualmente */
  }
}

class FakeLogoutUseCase {
  public callCount = 0;
  async execute() {
    this.callCount++;
  }
}

describe('TutorHomePage', () => {
  let fakeVm: FakeTutorHomePageViewModel;
  let fakeLogout: FakeLogoutUseCase;

  beforeEach(async () => {
    fakeVm = new FakeTutorHomePageViewModel();
    fakeLogout = new FakeLogoutUseCase();

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TutorHomePage],
      providers: [
        provideRouter([{ path: 'login', component: LoginStub }]),
        { provide: LogoutUseCase, useValue: fakeLogout },
      ],
    })
      // El page declara `providers: [TutorHomePageViewModel]` a nivel componente.
      // Sobrescribimos esa provisión para inyectar el fake.
      .overrideComponent(TutorHomePage, {
        set: {
          providers: [{ provide: TutorHomePageViewModel, useValue: fakeVm }],
        },
      })
      .compileComponents();
  });

  describe('skeleton inicial', () => {
    it('cuando profileLoading=true muestra "Cargando perfil…"', async () => {
      fakeVm.profileLoading.set(true);

      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.profile-card--skeleton')).not.toBeNull();
      expect(el.textContent).toContain('Cargando perfil…');
    });
  });

  describe('render con profile resuelto + 2 aulas', () => {
    beforeEach(() => {
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);
      fakeVm.userEmail.set('tutor1@vonex.pe');
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.userCode.set('T001');
      fakeVm.profileEmail.set('tutor1@vonex.pe');
      fakeVm.classroomCount.set(2);
      fakeVm.studentTotal.set(120);
    });

    it('muestra badge "Tutor" y subtítulo "Modo tutor"', async () => {
      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const badge = el.querySelector('.role-badge');
      expect(badge?.textContent?.trim()).toBe('Tutor');
      expect(el.textContent).toContain('Modo tutor');
    });

    it('muestra saludo "Hola, Carlos Mendoza"', async () => {
      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const greeting = el.querySelector('.tutor-home__greeting');
      expect(greeting?.textContent).toContain('Hola, Carlos Mendoza');
    });

    it('muestra email y código del tutor', async () => {
      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      // El template usa <dl>: <dt>Email</dt><dd>...</dd>
      const meta = el.querySelector('.profile-meta');
      expect(meta?.textContent).toContain('Email');
      expect(meta?.textContent).toContain('tutor1@vonex.pe');
      expect(meta?.textContent).toContain('DNI / Código');
      expect(meta?.textContent).toContain('T001');
    });

    it('muestra stats "Tenés 2 aulas · 120 alumnos"', async () => {
      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const stats = el.querySelector('.stats-card__line');
      expect(stats?.textContent).toContain('Tenés 2 aulas · 120 alumnos');
      // No debe aparecer el empty state.
      expect(el.querySelector('.stats-card__empty')).toBeNull();
    });
  });

  describe('empty state — sin aulas asignadas', () => {
    it('classrooms vacío → muestra "Aún no tenés aulas asignadas — contactá a tu administrador."', async () => {
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);
      fakeVm.userEmail.set('tutor1@vonex.pe');
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.userCode.set('T001');
      fakeVm.profileEmail.set('tutor1@vonex.pe');
      fakeVm.classroomCount.set(0);
      fakeVm.studentTotal.set(0);

      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const empty = el.querySelector('.stats-card__empty');
      expect(empty?.textContent).toContain('Aún no tenés aulas asignadas');
      expect(empty?.textContent).toContain('contactá a tu administrador');
      // No debe aparecer la línea de stats.
      expect(el.querySelector('.stats-card__line')).toBeNull();
    });
  });

  describe('degraded state — profileUnavailable', () => {
    it('muestra email + "Perfil no disponible" sin renderizar stats ni greeting con nombre', async () => {
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(true);
      fakeVm.userEmail.set('tutor1@vonex.pe');
      // Nombre y código quedan null en este escenario.
      fakeVm.userName.set(null);
      fakeVm.userCode.set(null);

      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const degraded = el.querySelector('.profile-card--degraded');
      expect(degraded).not.toBeNull();
      expect(degraded?.textContent).toContain('tutor1@vonex.pe');
      expect(degraded?.textContent).toContain('Perfil no disponible');
      // No debe aparecer el saludo con nombre ni la línea de stats.
      expect(el.querySelector('.stats-card')).toBeNull();
    });
  });

  describe('logout', () => {
    it('click en "Cerrar sesión" invoca LogoutUseCase.execute()', async () => {
      // Estado mínimo para que el botón se renderice (cualquier rama no-skeleton sirve).
      fakeVm.profileLoading.set(false);
      fakeVm.profileUnavailable.set(false);
      fakeVm.userEmail.set('tutor1@vonex.pe');
      fakeVm.userName.set('Carlos Mendoza');
      fakeVm.userCode.set('T001');
      fakeVm.profileEmail.set('tutor1@vonex.pe');
      fakeVm.classroomCount.set(2);
      fakeVm.studentTotal.set(120);

      const fixture = TestBed.createComponent(TutorHomePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const footerBtn = (fixture.nativeElement as HTMLElement).querySelector(
        'footer button',
      ) as HTMLButtonElement;
      expect(footerBtn).not.toBeNull();
      footerBtn.click();
      await fixture.whenStable();

      expect(fakeLogout.callCount).toBe(1);
    });
  });
});
