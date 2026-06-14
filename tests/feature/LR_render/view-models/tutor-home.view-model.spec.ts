import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TutorHomePageViewModel } from '../../../../src/LR_render/view-models/tutor-home.view-model';
import { GetIdentityUseCase } from '../../../../src/L2_application/use-cases/get-identity.use-case';
import { GetProfileUseCase } from '../../../../src/L2_application/use-cases/get-profile.use-case';
import { Identity, Role } from '../../../../src/L1_domain/entities/identity';
import { StudentProfile } from '../../../../src/L1_domain/value-objects/student-profile';
import {
  TutorClassroom,
  TutorProfile,
} from '../../../../src/L1_domain/value-objects/tutor-profile';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { ProfileNotAvailableError } from '../../../../src/L1_domain/errors/profile-not-available.error';

function buildTutorIdentity(): Identity {
  return new Identity(
    'user-id-tutor',
    'tenant-id',
    'tutor1@vonex.pe',
    null, // los tutores reales de learnex tienen codigo: null
    ['tutor'],
    [],
    Date.now() + 900_000,
  );
}

function buildClassroom(overrides: Partial<TutorClassroom> = {}): TutorClassroom {
  return {
    id: 'classroom-id',
    code: 'LIMA0001',
    name: 'Lima 01',
    modality: 'presencial',
    shift: 'manana',
    campusName: 'Lima Cercado',
    cycleId: 'cycle-id',
    cycleName: 'San Marcos - Semi Anual 0326',
    studentCount: 60,
    ...overrides,
  };
}

function buildTutorProfile(overrides: Partial<TutorProfile> = {}): TutorProfile {
  return {
    id: 'tutor-id',
    code: 'T001',
    firstName: 'Carlos',
    lastName: 'Mendoza',
    email: 'tutor1@vonex.pe',
    classrooms: [
      buildClassroom({ id: 'c1', code: 'LIMA0001', name: 'Lima 01', studentCount: 60 }),
      buildClassroom({ id: 'c2', code: 'LIMA0002', name: 'Lima 02', studentCount: 60 }),
    ],
    ...overrides,
  };
}

class FakeGetIdentityUseCase {
  private next: Identity | null = buildTutorIdentity();
  willReturn(i: Identity | null) {
    this.next = i;
  }
  async execute(): Promise<Identity | null> {
    return this.next;
  }
}

// Soporta tres modos para tutor: resolve, reject y suspend (para verificar
// que profileLoading pasa por true→false durante el await).
class FakeGetProfileUseCase {
  private mode: 'resolve' | 'reject' | 'suspend' = 'resolve';
  private resolved: TutorProfile = buildTutorProfile();
  private rejected: Error = new Error('not configured');
  private pending: Promise<TutorProfile> | null = null;
  private resolvePending: ((p: TutorProfile) => void) | null = null;
  public calls: Role[] = [];

  willResolveTutor(profile: TutorProfile) {
    this.mode = 'resolve';
    this.resolved = profile;
  }

  willReject(err: Error) {
    this.mode = 'reject';
    this.rejected = err;
  }

  willSuspend() {
    this.mode = 'suspend';
    this.pending = new Promise<TutorProfile>((resolve) => {
      this.resolvePending = resolve;
    });
  }

  resolveNow(profile: TutorProfile) {
    this.resolvePending?.(profile);
    this.pending = null;
    this.resolvePending = null;
  }

  async execute(role: Role): Promise<StudentProfile | TutorProfile> {
    this.calls.push(role);
    if (this.mode === 'suspend' && this.pending) {
      return await this.pending;
    }
    if (this.mode === 'reject') throw this.rejected;
    return this.resolved;
  }
}

describe('TutorHomePageViewModel', () => {
  let fakeGetIdentity: FakeGetIdentityUseCase;
  let fakeGetProfile: FakeGetProfileUseCase;

  const createVm = (): TutorHomePageViewModel =>
    TestBed.runInInjectionContext(() => new TutorHomePageViewModel());

  beforeEach(async () => {
    fakeGetIdentity = new FakeGetIdentityUseCase();
    fakeGetProfile = new FakeGetProfileUseCase();

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        { provide: GetIdentityUseCase, useValue: fakeGetIdentity },
        { provide: GetProfileUseCase, useValue: fakeGetProfile },
      ],
    }).compileComponents();
  });

  describe('start() — happy path con 2 aulas Lima 01/02', () => {
    it('publica userEmail, userName, userCode, profileEmail y stats agregadas', async () => {
      fakeGetIdentity.willReturn(buildTutorIdentity());
      fakeGetProfile.willResolveTutor(buildTutorProfile());

      const vm = createVm();
      await vm.start();

      expect(vm.userEmail()).toBe('tutor1@vonex.pe');
      expect(vm.userName()).toBe('Carlos Mendoza');
      expect(vm.userCode()).toBe('T001');
      expect(vm.profileEmail()).toBe('tutor1@vonex.pe');
      expect(vm.classroomCount()).toBe(2);
      expect(vm.studentTotal()).toBe(120);
      expect(vm.hasClassrooms()).toBe(true);
      expect(vm.statsText()).toBe('Tenés 2 aulas · 120 alumnos');
      expect(vm.profileUnavailable()).toBe(false);
    });

    it('llama a getProfile con role="tutor"', async () => {
      fakeGetIdentity.willReturn(buildTutorIdentity());
      fakeGetProfile.willResolveTutor(buildTutorProfile());

      const vm = createVm();
      await vm.start();

      expect(fakeGetProfile.calls).toEqual(['tutor']);
    });
  });

  describe('start() — sin aulas (classrooms: [])', () => {
    it('classroomCount=0, studentTotal=0, hasClassrooms=false, statsText=null', async () => {
      fakeGetIdentity.willReturn(buildTutorIdentity());
      fakeGetProfile.willResolveTutor(buildTutorProfile({ classrooms: [] }));

      const vm = createVm();
      await vm.start();

      expect(vm.classroomCount()).toBe(0);
      expect(vm.studentTotal()).toBe(0);
      expect(vm.hasClassrooms()).toBe(false);
      expect(vm.statsText()).toBeNull();
      // El nombre y código del tutor siguen disponibles.
      expect(vm.userName()).toBe('Carlos Mendoza');
      expect(vm.userCode()).toBe('T001');
    });
  });

  describe('degraded states', () => {
    it('ProfileNotAvailableError → profileUnavailable=true, userEmail seteado, userName/userCode null', async () => {
      fakeGetIdentity.willReturn(buildTutorIdentity());
      fakeGetProfile.willReject(new ProfileNotAvailableError());

      const vm = createVm();
      await vm.start();

      expect(vm.profileUnavailable()).toBe(true);
      expect(vm.userEmail()).toBe('tutor1@vonex.pe');
      expect(vm.userName()).toBeNull();
      expect(vm.userCode()).toBeNull();
      expect(vm.profileEmail()).toBeNull();
      expect(vm.classroomCount()).toBe(0);
      expect(vm.studentTotal()).toBe(0);
    });

    it('NetworkError → tolera silenciosamente: userEmail seteado, resto null, sin profileUnavailable', async () => {
      fakeGetIdentity.willReturn(buildTutorIdentity());
      fakeGetProfile.willReject(new NetworkError());

      const vm = createVm();
      await vm.start();

      expect(vm.userEmail()).toBe('tutor1@vonex.pe');
      expect(vm.userName()).toBeNull();
      expect(vm.userCode()).toBeNull();
      expect(vm.profileEmail()).toBeNull();
      expect(vm.profileUnavailable()).toBe(false);
    });

    it('sin identity (caso defensivo) → userEmail null y NO se llama a getProfile', async () => {
      fakeGetIdentity.willReturn(null);

      const vm = createVm();
      await vm.start();

      expect(vm.userEmail()).toBeNull();
      expect(vm.userName()).toBeNull();
      expect(fakeGetProfile.calls).toEqual([]);
    });

    it('error genérico no modelado se re-lanza para no silenciar bugs', async () => {
      fakeGetIdentity.willReturn(buildTutorIdentity());
      fakeGetProfile.willReject(new Error('boom — bug del programador'));

      const vm = createVm();
      await expect(vm.start()).rejects.toThrow('boom — bug del programador');
    });
  });

  describe('profileLoading() — toggle durante el await', () => {
    it('queda en true mientras el profile fetch está en vuelo y false al resolverse', async () => {
      fakeGetIdentity.willReturn(buildTutorIdentity());
      fakeGetProfile.willSuspend();

      const vm = createVm();
      const startPromise = vm.start();
      // Cedemos microtasks para que el VM avance hasta el profileLoading.set(true).
      await Promise.resolve();
      await Promise.resolve();

      expect(vm.profileLoading()).toBe(true);

      fakeGetProfile.resolveNow(buildTutorProfile());
      await startPromise;

      expect(vm.profileLoading()).toBe(false);
      expect(vm.userName()).toBe('Carlos Mendoza');
    });
  });
});
