import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { HomePage } from '../../../../../src/LR_render/pages/home/home.page';
import { GetIdentityUseCase } from '../../../../../src/L2_application/use-cases/get-identity.use-case';
import { GetProfileUseCase } from '../../../../../src/L2_application/use-cases/get-profile.use-case';
import { LogoutUseCase } from '../../../../../src/L2_application/use-cases/logout.use-case';
import { ObtenerSimulacrosDelDiaUseCase } from '../../../../../src/L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../../../../src/app.config';
import { Identity, Role } from '../../../../../src/L1_domain/entities/identity';
import { StudentProfile } from '../../../../../src/L1_domain/value-objects/student-profile';
import { TutorProfile } from '../../../../../src/L1_domain/value-objects/tutor-profile';
import { Simulacro } from '../../../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../../../src/L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../../../../src/L1_domain/value-objects/server-time';
import { NetworkError } from '../../../../../src/L1_domain/errors/network.error';
import { OfflineStorageUnavailableError } from '../../../../../src/L1_domain/errors/offline-storage-unavailable.error';
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

// Fake del use case L2 con control de outcome. Cuenta calls para verificar
// indirectamente el efecto de Reintentar / refresh.
class FakeObtenerSimulacrosDelDiaUseCase {
  private next: { kind: 'resolve'; list: readonly Simulacro[] } | { kind: 'reject'; error: Error } =
    {
      kind: 'resolve',
      list: [],
    };
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
  async setMarcacion(
    _simulacroId: string,
    _pregunta: number,
    _alternativa: AlternativaValue,
  ): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async getMarcaciones(_simulacroId: string): Promise<AnswersMap> {
    throw new Error('not used in HomePage tests');
  }
  async clearMarcaciones(_simulacroId: string): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async enqueueEnvio(_envio: EnvioPendiente): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async dequeueEnvio(_simulacroId: string): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
  async wipeUserScope(): Promise<void> {
    throw new Error('not used in HomePage tests');
  }
}

// Helper: cuelga el thread JS hasta que la microtask queue se vacíe.
// Necesario porque el constructor de HomePage dispara `void vm.start()`,
// que awaitea pre-check + fetch — ninguno de los dos awaits está atado
// al lifecycle de Angular, así que `whenStable()` por sí solo no los espera.
const flushPromises = async (iterations = 5): Promise<void> => {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
};

// Helper: construir un simulacro válido para sembrar la lista.
const buildSimulacro = (
  id: string,
  estadoValue: 'pendiente' | 'abierto' | 'enviado' | 'cerrado',
): Simulacro =>
  new Simulacro({
    id,
    area: 'Matemática',
    name: `Simulacro ${id}`,
    count: 20,
    inicio: new Date('2026-06-11T10:00:00Z'),
    fin: new Date('2026-06-11T12:00:00Z'),
    estado: new EstadoSimulacro(estadoValue),
  });

describe('HomePage', () => {
  let fakeGetIdentity: FakeGetIdentityUseCase;
  let fakeGetProfile: FakeGetProfileUseCase;
  let fakeLogout: FakeLogoutUseCase;
  let fakeObtener: FakeObtenerSimulacrosDelDiaUseCase;
  let fakeClock: FakeClock;
  let fakeMarkings: FakeMarkingsStorage;

  beforeEach(async () => {
    fakeGetIdentity = new FakeGetIdentityUseCase();
    fakeGetProfile = new FakeGetProfileUseCase();
    fakeLogout = new FakeLogoutUseCase();
    fakeObtener = new FakeObtenerSimulacrosDelDiaUseCase();
    fakeClock = new FakeClock();
    fakeMarkings = new FakeMarkingsStorage();
    // Default sano: identity válida + profile resuelto + pre-check OK + lista vacía.
    fakeGetIdentity.willReturn(buildIdentity());
    fakeGetProfile.willResolveStudent({ firstName: 'Fulano', lastName: 'Panda' });
    fakeMarkings.willResolveEnviosPendientes([]);
    fakeObtener.willResolve([]);

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
        { provide: ObtenerSimulacrosDelDiaUseCase, useValue: fakeObtener },
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

  describe('cita ambient', () => {
    it('renderiza una entrada del set INSPIRATIONAL_QUOTES dentro de <blockquote class="quote">', async () => {
      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();
      const blockquote = (fixture.nativeElement as HTMLElement).querySelector('blockquote.quote');
      expect(blockquote).not.toBeNull();
      const { INSPIRATIONAL_QUOTES } =
        await import('../../../../../src/LR_render/pages/home/inspirational-quotes');
      const text = blockquote?.textContent?.trim();
      expect(INSPIRATIONAL_QUOTES).toContain(text);
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

  describe('lista de simulacros', () => {
    it('renderiza al menos una card cuando el use case devuelve simulacros', async () => {
      fakeObtener.willResolve([
        buildSimulacro('sim-1', 'abierto'),
        buildSimulacro('sim-2', 'pendiente'),
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
      fakeObtener.willResolve([]);

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

    it('NO muestra el banner cuando el pre-check resuelve OK', async () => {
      fakeMarkings.willResolveEnviosPendientes([]);

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.banner--blocking')).toBeNull();
    });
  });

  describe('estados de error de servidor', () => {
    it('muestra "No se pudo conectar al servidor" y botón Reintentar cuando serverError es network', async () => {
      fakeObtener.willReject(new NetworkError());

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
      fakeObtener.willReject(new NetworkError());

      const fixture = TestBed.createComponent(HomePage);
      fixture.detectChanges();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      const callsAfterStart = fakeObtener.callCount;
      // Para el retry mostramos un happy path: si lo reintentan, sale bien.
      fakeObtener.willResolve([buildSimulacro('sim-1', 'abierto')]);

      const retryBtn = fixture.nativeElement.querySelector('.retry') as HTMLButtonElement;
      retryBtn.click();
      await flushPromises();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fakeObtener.callCount).toBe(callsAfterStart + 1);
    });
  });

  // El pull-to-refresh es gestual: requiere TouchEvents reales sobre un
  // scroll container con offset. En jsdom su simulación es flaky y testea
  // más la implementación del gesto que el comportamiento del refresh —
  // que ya está cubierto vía el botón Reintentar.
});
