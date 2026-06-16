import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { HomePage } from '../../../../../src/LR_render/pages/home/home.page';
import { GetIdentityUseCase } from '../../../../../src/L2_application/use-cases/get-identity.use-case';
import { GetProfileUseCase } from '../../../../../src/L2_application/use-cases/get-profile.use-case';
import { LogoutUseCase } from '../../../../../src/L2_application/use-cases/logout.use-case';
import { GetTodaysExamsUseCase } from '../../../../../src/L2_application/use-cases/get-todays-exams.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../../../../src/app.config';
import { Identity, Role } from '../../../../../src/L1_domain/entities/identity';
import { StudentProfile } from '../../../../../src/L1_domain/value-objects/student-profile';
import { TutorProfile } from '../../../../../src/L1_domain/value-objects/tutor-profile';
import { Exam } from '../../../../../src/L1_domain/entities/exam';
import { ExamServerStatus } from '../../../../../src/L1_domain/value-objects/exam-server-status';
import { ServerTime } from '../../../../../src/L1_domain/value-objects/server-time';
import { NetworkError } from '../../../../../src/L1_domain/errors/network.error';
import { OfflineStorageUnavailableError } from '../../../../../src/L1_domain/errors/offline-storage-unavailable.error';
import { StudentNotLinkedError } from '../../../../../src/L1_domain/errors/student-not-linked.error';
import { Clock } from '../../../../../src/L1_domain/ports/clock';
import {
  AlternativaValue,
  AnswersMap,
  EnvioPendiente,
  MarkingsStorage,
} from '../../../../../src/L1_domain/ports/markings-storage';

@Component({ template: '' })
class LoginStub {}

function buildIdentity(): Identity {
  return new Identity(
    'user-id',
    'tenant-id',
    'fulano@panda.test',
    '79507732',
    ['student'],
    [],
    Date.now() + 900_000,
  );
}

const buildStudentProfile = (overrides: Partial<StudentProfile> = {}): StudentProfile => ({
  id: 'student-id',
  code: '79507732',
  firstName: 'Fulano',
  lastName: 'Panda',
  area: null,
  ...overrides,
});

class FakeGetIdentityUseCase {
  private next: Identity | null = null;
  willReturn(i: Identity | null) {
    this.next = i;
  }
  async execute() {
    return this.next;
  }
}

class FakeGetProfileUseCase {
  private next:
    | { kind: 'resolve'; profile: StudentProfile | TutorProfile }
    | { kind: 'reject'; error: Error } = {
    kind: 'resolve',
    profile: buildStudentProfile(),
  };
  public calls: Role[] = [];

  willResolveStudent(p: Partial<StudentProfile> = {}) {
    this.next = { kind: 'resolve', profile: buildStudentProfile(p) };
  }
  willReject(err: Error) {
    this.next = { kind: 'reject', error: err };
  }

  async execute(role: Role): Promise<StudentProfile | TutorProfile> {
    this.calls.push(role);
    if (this.next.kind === 'reject') throw this.next.error;
    return this.next.profile;
  }
}

class FakeLogoutUseCase {
  public callCount = 0;
  async execute() {
    this.callCount++;
  }
}

class FakeGetTodaysExamsUseCase {
  private next: { kind: 'resolve'; list: readonly Exam[] } | { kind: 'reject'; error: Error } = {
    kind: 'resolve',
    list: [],
  };
  public callCount = 0;

  willResolve(list: readonly Exam[]) {
    this.next = { kind: 'resolve', list };
  }
  willReject(error: Error) {
    this.next = { kind: 'reject', error };
  }

  async execute(): Promise<readonly Exam[]> {
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
    /* no-op */
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
  async hasSubmittedAck(_examId: string): Promise<boolean> {
    return false;
  }
  async setMarcacion(
    _examId: string,
    _pregunta: number,
    _alternativa: AlternativaValue,
  ): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async getMarcaciones(_examId: string): Promise<AnswersMap> {
    throw new Error('not used in HomePage tests');
  }
  async clearMarcaciones(_examId: string): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async enqueueEnvio(_envio: EnvioPendiente): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async dequeueEnvio(_examId: string): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async wipeUserScope(): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
}

const flushPromises = async (iterations = 5): Promise<void> => {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
};

const buildExam = (
  id: string,
  serverStatusValue: 'scheduled' | 'in_progress' | 'finalized',
): Exam => {
  const inProgress = serverStatusValue === 'in_progress';
  const finalized = serverStatusValue === 'finalized';
  return new Exam({
    id,
    area: 'Matemática',
    course: 'Aritmética',
    type: 'simulacro',
    name: `Examen ${id}`,
    count: 20,
    duration: 7200,
    scheduled: new Date('2026-06-11T10:00:00Z'),
    started: inProgress || finalized ? new Date('2026-06-11T10:00:05Z') : null,
    finished: finalized ? new Date('2026-06-11T12:00:00Z') : null,
    serverStatus: new ExamServerStatus(serverStatusValue),
  });
};

describe('HomePage', () => {
  let fakeGetIdentity: FakeGetIdentityUseCase;
  let fakeGetProfile: FakeGetProfileUseCase;
  let fakeLogout: FakeLogoutUseCase;
  let fakeGetTodaysExams: FakeGetTodaysExamsUseCase;
  let fakeClock: FakeClock;
  let fakeMarkings: FakeMarkingsStorage;

  beforeEach(async () => {
    fakeGetIdentity = new FakeGetIdentityUseCase();
    fakeGetProfile = new FakeGetProfileUseCase();
    fakeLogout = new FakeLogoutUseCase();
    fakeGetTodaysExams = new FakeGetTodaysExamsUseCase();
    fakeClock = new FakeClock();
    fakeMarkings = new FakeMarkingsStorage();
    // Default sano.
    fakeGetIdentity.willReturn(buildIdentity());
    fakeGetProfile.willResolveStudent({ firstName: 'Fulano', lastName: 'Panda' });
    fakeMarkings.willResolveEnviosPendientes([]);
    fakeGetTodaysExams.willResolve([]);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([
          { path: 'home', component: HomePage },
          { path: 'login', component: LoginStub },
        ]),
        { provide: GetIdentityUseCase, useValue: fakeGetIdentity },
        { provide: GetProfileUseCase, useValue: fakeGetProfile },
        { provide: LogoutUseCase, useValue: fakeLogout },
        { provide: GetTodaysExamsUseCase, useValue: fakeGetTodaysExams },
        { provide: CLOCK, useValue: fakeClock },
        { provide: MARKINGS_STORAGE, useValue: fakeMarkings },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saludo y sesión', () => {
    it('muestra saludo con el email del usuario activo', async () => {
      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.greeting')?.textContent).toContain('fulano@panda.test');
    });

    it('NO muestra saludo si no hay sesión (estado raro: protegido por authGuard)', async () => {
      fakeGetIdentity.willReturn(null);
      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.greeting')).toBeNull();
    });
  });

  describe('logout', () => {
    it('click en "Cerrar sesión" invoca LogoutUseCase y navega a /login', async () => {
      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const router = TestBed.inject(Router);
      const footerBtn = fixture.nativeElement.querySelector('footer button') as HTMLButtonElement;
      footerBtn.click();
      await fixture.whenStable();

      expect(fakeLogout.callCount).toBe(1);
      expect(router.url).toBe('/login');
    });
  });

  describe('lista de exámenes', () => {
    it('renderiza una card por examen cuando el use case devuelve lista', async () => {
      fakeGetTodaysExams.willResolve([
        buildExam('exam-1', 'in_progress'),
        buildExam('exam-2', 'scheduled'),
      ]);

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const cards = el.querySelectorAll('.card');
      expect(cards.length).toBe(2);
    });

    it('muestra "No tienes simulacros asignados para hoy" cuando la lista está vacía y no hay error', async () => {
      fakeGetTodaysExams.willResolve([]);

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.empty-state')?.textContent).toContain(
        'No tienes simulacros asignados para hoy',
      );
    });
  });

  describe('pre-check de IndexedDB', () => {
    it('muestra el banner offline-storage-blocked cuando el pre-check rechaza con OfflineStorageUnavailableError', async () => {
      fakeMarkings.willRejectEnviosPendientes(
        new OfflineStorageUnavailableError('IDB no disponible'),
      );

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.banner--blocking')).not.toBeNull();
    });
  });

  describe('StudentNotLinked banner', () => {
    it('renderiza el banner con el copy en español verbatim cuando la lista falla con StudentNotLinkedError', async () => {
      fakeGetTodaysExams.willReject(new StudentNotLinkedError());

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      // El template tiene 2 banners --blocking: IDB y studentNotLinked.
      // Cuando IDB resuelve OK y studentNotLinked es true, solo aparece el de
      // studentNotLinked con el copy verbatim del template.
      const banners = el.querySelectorAll('.banner--blocking');
      const studentBanner = Array.from(banners).find((b) =>
        (b.textContent ?? '').includes('Tu cuenta no tiene un alumno asociado'),
      );
      expect(studentBanner).toBeDefined();
      expect(studentBanner?.textContent).toContain(
        'Tu cuenta no tiene un alumno asociado, contacta al tutor.',
      );
    });
  });

  describe('estados de error de servidor', () => {
    it('muestra "No se pudo conectar al servidor" y botón Reintentar cuando serverError es network', async () => {
      fakeGetTodaysExams.willReject(new NetworkError());

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const banner = el.querySelector('.banner--error');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('No se pudo conectar al servidor');
      expect(el.querySelector('.retry')?.textContent).toContain('Reintentar');
    });

    it('click en Reintentar dispara un nuevo execute del use case', async () => {
      fakeGetTodaysExams.willReject(new NetworkError());

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const callsAfterStart = fakeGetTodaysExams.callCount;
      fakeGetTodaysExams.willResolve([buildExam('exam-1', 'in_progress')]);

      const retryBtn = fixture.nativeElement.querySelector('.retry') as HTMLButtonElement;
      retryBtn.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeGetTodaysExams.callCount).toBe(callsAfterStart + 1);
    });
  });

  describe('cita ambient', () => {
    it('renderiza una entrada del set INSPIRATIONAL_QUOTES dentro de <blockquote class="quote">', async () => {
      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();
      const blockquote = (fixture.nativeElement as HTMLElement).querySelector('blockquote.quote');
      expect(blockquote).not.toBeNull();
      const { INSPIRATIONAL_QUOTES } = await import(
        '../../../../../src/LR_render/pages/home/inspirational-quotes'
      );
      const text = blockquote?.textContent?.trim();
      expect(INSPIRATIONAL_QUOTES).toContain(text);
    });
  });
});
