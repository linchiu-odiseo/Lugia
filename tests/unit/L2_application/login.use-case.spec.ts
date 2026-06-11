import { describe, it, expect, beforeEach } from 'vitest';
import { LoginUseCase } from '../../../src/L2_application/use-cases/login.use-case';
import { Session } from '../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../src/L1_domain/value-objects/bearer-token';
import { InvalidCredentialsError } from '../../../src/L1_domain/errors/invalid-credentials.error';
import { NetworkError } from '../../../src/L1_domain/errors/network.error';
import { FakeAuthRepository, InMemorySessionStorage } from './fakes';

describe('LoginUseCase', () => {
  let repo: FakeAuthRepository;
  let storage: InMemorySessionStorage;
  let useCase: LoginUseCase;

  const credentials = { email: 'fulano@panda.test', password: '12345678' };
  const sessionFor = (token: string, email: string) =>
    new Session(new BearerToken(token), email, new Date('2026-06-11T12:00:00Z'));

  beforeEach(() => {
    repo = new FakeAuthRepository();
    storage = new InMemorySessionStorage();
    useCase = new LoginUseCase(repo, storage);
  });

  it('login exitoso devuelve la Session', async () => {
    const session = sessionFor('6|abc', 'fulano@panda.test');
    repo.willResolveLogin(session);
    const result = await useCase.execute(credentials);
    expect(result).toBe(session);
  });

  it('login exitoso persiste la Session en storage', async () => {
    const session = sessionFor('6|abc', 'fulano@panda.test');
    repo.willResolveLogin(session);
    await useCase.execute(credentials);
    expect(await storage.read()).toBe(session);
  });

  it('login exitoso pasa las credenciales al repo tal cual', async () => {
    repo.willResolveLogin(sessionFor('6|abc', 'fulano@panda.test'));
    await useCase.execute(credentials);
    expect(repo.getLoginCalls()).toEqual([credentials]);
  });

  it('credenciales inválidas re-rechazan con InvalidCredentialsError', async () => {
    repo.willRejectLogin(new InvalidCredentialsError());
    await expect(useCase.execute(credentials)).rejects.toThrow(InvalidCredentialsError);
  });

  it('credenciales inválidas NO persisten sesión', async () => {
    repo.willRejectLogin(new InvalidCredentialsError());
    await useCase.execute(credentials).catch(() => undefined);
    expect(await storage.read()).toBeNull();
  });

  it('credenciales inválidas NO tocan la sesión previa persistida', async () => {
    const previous = sessionFor('5|old', 'otra@panda.test');
    await storage.write(previous);
    repo.willRejectLogin(new InvalidCredentialsError());
    await useCase.execute(credentials).catch(() => undefined);
    expect(await storage.read()).toBe(previous);
  });

  it('error de red re-rechaza con NetworkError sin tocar storage', async () => {
    const previous = sessionFor('5|old', 'otra@panda.test');
    await storage.write(previous);
    repo.willRejectLogin(new NetworkError());
    await expect(useCase.execute(credentials)).rejects.toThrow(NetworkError);
    expect(await storage.read()).toBe(previous);
  });

  it('login exitoso descarta sesión previa antes de persistir la nueva', async () => {
    const previous = sessionFor('5|old', 'otra@panda.test');
    const next = sessionFor('6|new', 'fulano@panda.test');
    await storage.write(previous);
    repo.willResolveLogin(next);
    await useCase.execute(credentials);
    expect(await storage.read()).toBe(next);
  });
});
