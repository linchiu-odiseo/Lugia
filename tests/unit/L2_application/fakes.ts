// Dobles manuales de los puertos L1 para tests de L2.
// Convención: clases reales (no vi.fn()) para forzar que la interface se respete
// y para que el reader vea el contrato del puerto en el doble.

import { AuthRepository, Credentials } from '../../../src/L1_domain/ports/auth-repository';
import { SessionStorage } from '../../../src/L1_domain/ports/session-storage';
import {
  AlternativaValue,
  AnswersMap,
  EnvioPendiente,
  MarkingsStorage,
} from '../../../src/L1_domain/ports/markings-storage';
import { Session } from '../../../src/L1_domain/entities/session';
import { Clock } from '../../../src/L1_domain/ports/clock';
import {
  EnvioRequest,
  EnvioResult,
  SimulacrosApi,
  SimulacrosListResult,
} from '../../../src/L1_domain/ports/simulacros-api';
import { ServerTime } from '../../../src/L1_domain/value-objects/server-time';

export class InMemorySessionStorage implements SessionStorage {
  private store: Session | null = null;
  // Lista opcional compartida para registrar el orden en que el use case
  // invoca `clear()` relativo a otras ops (ej: `markings.wipeUserScope()`).
  // Si los tests pasan el mismo array al fake de markings, se obtiene un
  // log unificado para assertear secuencias.
  private sharedOpsLog: string[] | null = null;

  bindOpsLog(log: string[]): void {
    this.sharedOpsLog = log;
  }

  async read(): Promise<Session | null> {
    return this.store;
  }

  async write(s: Session): Promise<void> {
    this.store = s;
  }

  async clear(): Promise<void> {
    this.sharedOpsLog?.push('session.clear');
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

// Doble manual de `MarkingsStorage` para tests de L2.
// Mantiene marcaciones en un Map keyed por `simulacroId|pregunta` y la cola
// de envíos en otro Map keyed por `simulacroId`. NO necesita simular scope
// por usuario — eso es responsabilidad del adapter L3; este fake opera
// como si estuviera en el scope del usuario actual.
//
// Adicionalmente registra el ORDEN de invocaciones de ops mutativas
// para que los tests puedan verificar secuencias (ej: wipe antes que clear
// de sesión). `getOpsLog()` y `getWipeCalls()` exponen ese registro.
export class InMemoryMarkingsStorage implements MarkingsStorage {
  private marcaciones = new Map<string, AlternativaValue>();
  private queue = new Map<string, EnvioPendiente>();
  private wipeShouldFail = false;
  private wipeCalls = 0;
  private opsLog: string[] = [];

  // Si se conecta a un log compartido (vía `bindOpsLog`), las ops se
  // registran ahí para que los tests puedan assertear secuencias que
  // crucen este fake y otros (ej: InMemorySessionStorage).
  bindOpsLog(log: string[]): void {
    this.opsLog = log;
  }

  // Hooks de control para tests.
  willRejectWipe(): void {
    this.wipeShouldFail = true;
  }

  getWipeCalls(): number {
    return this.wipeCalls;
  }

  getOpsLog(): readonly string[] {
    return this.opsLog;
  }

  // Helpers para sembrar estado en tests.
  seedMarcacion(simulacroId: string, pregunta: number, alternativa: AlternativaValue): void {
    this.marcaciones.set(`${simulacroId}|${pregunta}`, alternativa);
  }

  seedEnvio(envio: EnvioPendiente): void {
    this.queue.set(envio.simulacroId, envio);
  }

  hasAnyState(): boolean {
    return this.marcaciones.size > 0 || this.queue.size > 0;
  }

  // --- Puerto MarkingsStorage ---

  async setMarcacion(
    simulacroId: string,
    pregunta: number,
    alternativa: AlternativaValue,
  ): Promise<void> {
    this.opsLog.push('markings.setMarcacion');
    this.marcaciones.set(`${simulacroId}|${pregunta}`, alternativa);
  }

  async getMarcaciones(simulacroId: string): Promise<AnswersMap> {
    const prefix = `${simulacroId}|`;
    const out: AnswersMap = {};
    for (const [key, val] of this.marcaciones.entries()) {
      if (key.startsWith(prefix)) {
        out[key.slice(prefix.length)] = val;
      }
    }
    return out;
  }

  async clearMarcaciones(simulacroId: string): Promise<void> {
    this.opsLog.push('markings.clearMarcaciones');
    const prefix = `${simulacroId}|`;
    for (const key of [...this.marcaciones.keys()]) {
      if (key.startsWith(prefix)) this.marcaciones.delete(key);
    }
  }

  async enqueueEnvio(envio: EnvioPendiente): Promise<void> {
    this.opsLog.push('markings.enqueueEnvio');
    this.queue.set(envio.simulacroId, envio);
  }

  async getEnviosPendientes(): Promise<EnvioPendiente[]> {
    return [...this.queue.values()];
  }

  async dequeueEnvio(simulacroId: string): Promise<void> {
    this.opsLog.push('markings.dequeueEnvio');
    this.queue.delete(simulacroId);
  }

  async wipeUserScope(): Promise<void> {
    this.opsLog.push('markings.wipeUserScope');
    this.wipeCalls++;
    if (this.wipeShouldFail) {
      throw new Error('IndexedDB wipe falló en runtime');
    }
    this.marcaciones.clear();
    this.queue.clear();
  }
}

// Doble manual del puerto `SimulacrosApi`. Permite preconfigurar el próximo
// resultado/rejection de `obtenerDelDia()` y `enviar()`, y registra todas
// las llamadas a `enviar()` (con su payload exacto) para que los tests
// puedan verificar que se preservó `clientSubmittedAt` original entre
// intento, encolado y retry.
//
// La cola interna `enviarPlan` soporta dos modos:
//   - "scalar": el mismo resultado/error se devuelve para cada llamada
//   - "sequence": uno por llamada en orden, útil para tests del retomar
//     use case con mezcla de éxito + NetworkError.
export class FakeSimulacrosApi implements SimulacrosApi {
  private nextObtener:
    | { kind: 'resolve'; result: SimulacrosListResult }
    | { kind: 'reject'; error: Error }
    | null = null;
  private obtenerCalls = 0;

  private enviarScalar:
    | { kind: 'resolve'; result: EnvioResult }
    | { kind: 'reject'; error: Error }
    | null = null;
  private enviarSequence: (
    | { kind: 'resolve'; result: EnvioResult }
    | { kind: 'reject'; error: Error }
  )[] = [];
  private enviarCalls: EnvioRequest[] = [];

  willResolveObtenerDelDia(result: SimulacrosListResult): void {
    this.nextObtener = { kind: 'resolve', result };
  }

  willRejectObtenerDelDia(error: Error): void {
    this.nextObtener = { kind: 'reject', error };
  }

  getObtenerCalls(): number {
    return this.obtenerCalls;
  }

  willResolveEnviar(result: EnvioResult): void {
    this.enviarScalar = { kind: 'resolve', result };
  }

  willRejectEnviar(error: Error): void {
    this.enviarScalar = { kind: 'reject', error };
  }

  // Sembrar una secuencia: 1 entry por cada llamada esperada a enviar().
  // Útil para RetomarEnviosPendientesUseCase con N envíos en cola.
  willEnviarInSequence(
    plan: readonly ({ kind: 'resolve'; result: EnvioResult } | { kind: 'reject'; error: Error })[],
  ): void {
    this.enviarSequence = [...plan];
  }

  getEnviarCalls(): readonly EnvioRequest[] {
    return this.enviarCalls;
  }

  async obtenerDelDia(): Promise<SimulacrosListResult> {
    this.obtenerCalls++;
    if (!this.nextObtener) {
      throw new Error(
        'FakeSimulacrosApi: configurar willResolveObtenerDelDia o willRejectObtenerDelDia antes de llamar obtenerDelDia()',
      );
    }
    if (this.nextObtener.kind === 'reject') throw this.nextObtener.error;
    return this.nextObtener.result;
  }

  async enviar(req: EnvioRequest): Promise<EnvioResult> {
    this.enviarCalls.push(req);
    if (this.enviarSequence.length > 0) {
      const next = this.enviarSequence.shift();
      if (!next) {
        throw new Error('FakeSimulacrosApi: enviarSequence agotada.');
      }
      if (next.kind === 'reject') throw next.error;
      return next.result;
    }
    if (this.enviarScalar) {
      if (this.enviarScalar.kind === 'reject') throw this.enviarScalar.error;
      return this.enviarScalar.result;
    }
    throw new Error(
      'FakeSimulacrosApi: configurar willResolveEnviar / willRejectEnviar / willEnviarInSequence antes de llamar enviar()',
    );
  }
}

// Doble manual del puerto `Clock`. Registra las llamadas a setServerTime
// para que los tests del use case puedan assertear que el side-effect ocurrió.
// `now()` devuelve el último ServerTime seteado, o new Date() como fallback.
export class FakeClock implements Clock {
  private currentServerTime: ServerTime | null = null;
  private setServerTimeCalls: ServerTime[] = [];

  now(): Date {
    return this.currentServerTime ? this.currentServerTime.value : new Date();
  }

  setServerTime(serverTime: ServerTime): void {
    this.currentServerTime = serverTime;
    this.setServerTimeCalls.push(serverTime);
  }

  getSetServerTimeCalls(): readonly ServerTime[] {
    return this.setServerTimeCalls;
  }
}
