// Dobles manuales de los puertos L1 para tests de L2.
// Convención: clases reales (no vi.fn()) para forzar que la interface se respete
// y para que el reader vea el contrato del puerto en el doble.

import { AuthRepository, Credentials } from '../../../src/L1_domain/ports/auth-repository';
import { SessionStorage } from '../../../src/L1_domain/ports/session-storage';
import { Session } from '../../../src/L1_domain/entities/session';

export class InMemorySessionStorage implements SessionStorage {
  private store: Session | null = null;

  async read(): Promise<Session | null> {
    return this.store;
  }

  async write(s: Session): Promise<void> {
    this.store = s;
  }

  async clear(): Promise<void> {
    this.store = null;
  }
}

export class FakeAuthRepository implements AuthRepository {
  private nextLogin: { kind: 'resolve'; session: Session } | { kind: 'reject'; error: Error } | null = null;
  private logoutShouldFail = false;
  private loginCalls: Credentials[] = [];
  private logoutCalls: Session[] = [];

  willResolveLogin(session: Session): void {
    this.nextLogin = { kind: 'resolve', session };
  }

  willRejectLogin(error: Error): void {
    this.nextLogin = { kind: 'reject', error };
  }

  willRejectLogout(): void {
    this.logoutShouldFail = true;
  }

  async login(credentials: Credentials): Promise<Session> {
    this.loginCalls.push(credentials);
    if (!this.nextLogin) {
      throw new Error('FakeAuthRepository: configurar willResolveLogin o willRejectLogin antes de llamar login()');
    }
    if (this.nextLogin.kind === 'reject') throw this.nextLogin.error;
    return this.nextLogin.session;
  }

  async logout(session: Session): Promise<void> {
    this.logoutCalls.push(session);
    if (this.logoutShouldFail) throw new Error('logout server-side falló');
  }

  getLoginCalls(): readonly Credentials[] {
    return this.loginCalls;
  }

  getLogoutCalls(): readonly Session[] {
    return this.logoutCalls;
  }
}
