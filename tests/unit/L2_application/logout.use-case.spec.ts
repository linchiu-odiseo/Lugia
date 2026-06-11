import { describe, it, expect, beforeEach } from 'vitest';
import { LogoutUseCase } from '../../../src/L2_application/use-cases/logout.use-case';
import { Session } from '../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../src/L1_domain/value-objects/bearer-token';
import { FakeAuthRepository, InMemorySessionStorage } from './fakes';

describe('LogoutUseCase', () => {
  let repo: FakeAuthRepository;
  let storage: InMemorySessionStorage;
  let useCase: LogoutUseCase;

  const activeSession = new Session(
    new BearerToken('6|abc'),
    'fulano@panda.test',
    new Date('2026-06-11T12:00:00Z'),
  );

  beforeEach(() => {
    repo = new FakeAuthRepository();
    storage = new InMemorySessionStorage();
    useCase = new LogoutUseCase(repo, storage);
  });

  it('con sesión activa: limpia storage', async () => {
    await storage.write(activeSession);
    await useCase.execute();
    expect(await storage.read()).toBeNull();
  });

  it('con sesión activa: invoca repo.logout con la sesión', async () => {
    await storage.write(activeSession);
    await useCase.execute();
    expect(repo.getLogoutCalls()).toEqual([activeSession]);
  });

  it('sin sesión activa: no invoca repo (idempotente)', async () => {
    await useCase.execute();
    expect(repo.getLogoutCalls()).toEqual([]);
  });

  it('sin sesión activa: completa sin error (no-op)', async () => {
    await expect(useCase.execute()).resolves.toBeUndefined();
  });

  it('best-effort: si repo.logout falla, igual limpia storage local', async () => {
    await storage.write(activeSession);
    repo.willRejectLogout();
    await useCase.execute();
    expect(await storage.read()).toBeNull();
  });
});
