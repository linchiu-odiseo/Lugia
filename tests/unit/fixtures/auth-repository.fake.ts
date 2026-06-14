// Fake manual del puerto `AuthRepository` para tests de L2.
// Permite preconfigurar respuestas/errores de cada método y registra llamadas
// para que los tests puedan verificar que se invocaron correctamente.

import { AuthRepository } from '../../../src/L1_domain/ports/auth-repository';
import { Identity, Role } from '../../../src/L1_domain/entities/identity';
import { StudentProfile } from '../../../src/L1_domain/value-objects/student-profile';
import { TutorProfile } from '../../../src/L1_domain/value-objects/tutor-profile';

export class FakeAuthRepository implements AuthRepository {
  private nextLogin:
    | { kind: 'resolve'; identity: Identity }
    | { kind: 'reject'; error: Error }
    | null = null;
  private nextMe:
    | { kind: 'resolve'; identity: Identity }
    | { kind: 'reject'; error: Error }
    | null = null;
  private nextRefresh:
    | { kind: 'resolve'; identity: Identity }
    | { kind: 'reject'; error: Error }
    | null = null;
  private logoutShouldFail = false;
  private nextProfile:
    | { kind: 'resolve'; profile: StudentProfile | TutorProfile }
    | { kind: 'reject'; error: Error }
    | null = null;

  private loginCalls: { email: string; password: string }[] = [];
  private meCalls = 0;
  private refreshCalls = 0;
  private logoutCalls = 0;
  private profileCalls: Role[] = [];

  // Configuración

  willResolveLogin(identity: Identity): void {
    this.nextLogin = { kind: 'resolve', identity };
  }

  willRejectLogin(error: Error): void {
    this.nextLogin = { kind: 'reject', error };
  }

  willResolveMe(identity: Identity): void {
    this.nextMe = { kind: 'resolve', identity };
  }

  willRejectMe(error: Error): void {
    this.nextMe = { kind: 'reject', error };
  }

  willResolveRefresh(identity: Identity): void {
    this.nextRefresh = { kind: 'resolve', identity };
  }

  willRejectRefresh(error: Error): void {
    this.nextRefresh = { kind: 'reject', error };
  }

  willRejectLogout(): void {
    this.logoutShouldFail = true;
  }

  willResolveProfile(profile: StudentProfile | TutorProfile): void {
    this.nextProfile = { kind: 'resolve', profile };
  }

  willRejectProfile(error: Error): void {
    this.nextProfile = { kind: 'reject', error };
  }

  // Inspectores

  getLoginCalls(): readonly { email: string; password: string }[] {
    return this.loginCalls;
  }

  getMeCalls(): number {
    return this.meCalls;
  }

  getRefreshCalls(): number {
    return this.refreshCalls;
  }

  getLogoutCalls(): number {
    return this.logoutCalls;
  }

  getProfileCalls(): readonly Role[] {
    return this.profileCalls;
  }

  // Implementación del puerto

  async login(credentials: { email: string; password: string }): Promise<Identity> {
    this.loginCalls.push(credentials);
    if (!this.nextLogin)
      throw new Error(
        'FakeAuthRepository: configurar willResolveLogin/willRejectLogin antes de login()',
      );
    if (this.nextLogin.kind === 'reject') throw this.nextLogin.error;
    return this.nextLogin.identity;
  }

  async me(): Promise<Identity> {
    this.meCalls++;
    if (!this.nextMe)
      throw new Error('FakeAuthRepository: configurar willResolveMe/willRejectMe antes de me()');
    if (this.nextMe.kind === 'reject') throw this.nextMe.error;
    return this.nextMe.identity;
  }

  async refresh(): Promise<Identity> {
    this.refreshCalls++;
    if (!this.nextRefresh)
      throw new Error(
        'FakeAuthRepository: configurar willResolveRefresh/willRejectRefresh antes de refresh()',
      );
    if (this.nextRefresh.kind === 'reject') throw this.nextRefresh.error;
    return this.nextRefresh.identity;
  }

  async logout(): Promise<void> {
    this.logoutCalls++;
    if (this.logoutShouldFail) throw new Error('logout server-side falló');
  }

  async getProfile(role: Role): Promise<StudentProfile | TutorProfile> {
    this.profileCalls.push(role);
    if (!this.nextProfile)
      throw new Error(
        'FakeAuthRepository: configurar willResolveProfile/willRejectProfile antes de getProfile()',
      );
    if (this.nextProfile.kind === 'reject') throw this.nextProfile.error;
    return this.nextProfile.profile;
  }
}
