import { describe, it, expect, beforeEach } from 'vitest';
import { LogoutUseCase } from '../../../src/L2_application/use-cases/logout.use-case';
import { Session } from '../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../src/L1_domain/value-objects/bearer-token';
import {
  FakeAuthRepository,
  InMemoryMarkingsStorage,
  InMemorySessionStorage,
} from './fakes';

describe('LogoutUseCase', () => {
  let repo: FakeAuthRepository;
  let storage: InMemorySessionStorage;
  let markings: InMemoryMarkingsStorage;
  let useCase: LogoutUseCase;

  const activeSession = new Session(
    new BearerToken('6|abc'),
    'fulano@panda.test',
    new Date('2026-06-11T12:00:00Z'),
  );

  beforeEach(() => {
    repo = new FakeAuthRepository();
    storage = new InMemorySessionStorage();
    markings = new InMemoryMarkingsStorage();
    useCase = new LogoutUseCase(repo, storage, markings);
  });

  describe('con sesión activa', () => {
    it('limpia storage', async () => {
      await storage.write(activeSession);
      await useCase.execute();
      expect(await storage.read()).toBeNull();
    });

    it('invoca repo.logout con la sesión', async () => {
      await storage.write(activeSession);
      await useCase.execute();
      expect(repo.getLogoutCalls()).toEqual([activeSession]);
    });

    it('invoca markings.wipeUserScope() exactamente una vez', async () => {
      await storage.write(activeSession);
      await useCase.execute();
      expect(markings.getWipeCalls()).toBe(1);
    });

    it('invoca markings.wipeUserScope() ANTES de storage.clear()', async () => {
      // Por qué importa: el adapter real (`IndexedDbMarkingsStorage`)
      // deriva el `userEmail` leyendo la sesión activa. Si la sesión se
      // limpia primero, el wipe queda sin scope y no borra nada — o peor,
      // explota. El use case SHALL respetar este orden.
      const opsLog: string[] = [];
      storage.bindOpsLog(opsLog);
      markings.bindOpsLog(opsLog);
      await storage.write(activeSession);

      await useCase.execute();

      const wipeIdx = opsLog.indexOf('markings.wipeUserScope');
      const clearIdx = opsLog.indexOf('session.clear');
      expect(wipeIdx).toBeGreaterThanOrEqual(0);
      expect(clearIdx).toBeGreaterThanOrEqual(0);
      expect(wipeIdx).toBeLessThan(clearIdx);
    });

    it('best-effort: si wipeUserScope falla, igual limpia la sesión', async () => {
      await storage.write(activeSession);
      markings.willRejectWipe();
      await useCase.execute();
      expect(await storage.read()).toBeNull();
    });

    it('best-effort: si wipeUserScope falla, igual invoca repo.logout', async () => {
      await storage.write(activeSession);
      markings.willRejectWipe();
      await useCase.execute();
      expect(repo.getLogoutCalls()).toEqual([activeSession]);
    });

    it('best-effort: si repo.logout falla, igual limpia storage local', async () => {
      await storage.write(activeSession);
      repo.willRejectLogout();
      await useCase.execute();
      expect(await storage.read()).toBeNull();
    });
  });

  describe('sin sesión activa', () => {
    it('no invoca repo (idempotente)', async () => {
      await useCase.execute();
      expect(repo.getLogoutCalls()).toEqual([]);
    });

    it('NO invoca markings.wipeUserScope() (no hay scope que derivar)', async () => {
      await useCase.execute();
      expect(markings.getWipeCalls()).toBe(0);
    });

    it('completa sin error (no-op)', async () => {
      await expect(useCase.execute()).resolves.toBeUndefined();
    });
  });
});
