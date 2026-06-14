import { describe, it, expect, beforeEach } from 'vitest';
import { LoginUseCase } from '../../../../src/L2_application/use-cases/login.use-case';
import { Identity } from '../../../../src/L1_domain/entities/identity';
import { InvalidCredentialsError } from '../../../../src/L1_domain/errors/invalid-credentials.error';
import { RateLimitError } from '../../../../src/L1_domain/errors/rate-limit.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { FakeAuthRepository } from '../../fixtures/auth-repository.fake';
import { FakeIdentityStorage } from '../../fixtures/identity-storage.fake';
import { FakeProfileStorage } from '../../fixtures/profile-storage.fake';
import { GetProfileUseCase } from '../../../../src/L2_application/use-cases/get-profile.use-case';

const NOW = 1_700_000_000_000;

const makeStudentIdentity = () =>
  new Identity(
    '766aac21-71f9-4f48-a14a-5c2bcebc7d0b',
    '5fff5eec-34dc-40a2-b15e-10e503e7c2dc',
    '79507732@vonex.edu.pe',
    '79507732',
    ['student'],
    ['student:exams:view'],
    NOW + 900_000,
  );

const makeTutorIdentity = () =>
  new Identity(
    '7526d026-7de5-4b99-bd2f-cc95b560f630',
    '5fff5eec-34dc-40a2-b15e-10e503e7c2dc',
    'tutor1@vonex.pe',
    null,
    ['tutor'],
    ['tutor:profile:view'],
    NOW + 900_000,
  );

describe('LoginUseCase', () => {
  let repo: FakeAuthRepository;
  let identityStorage: FakeIdentityStorage;
  let profileStorage: FakeProfileStorage;
  let getProfile: GetProfileUseCase;
  let useCase: LoginUseCase;

  const credentials = { email: '79507732@vonex.edu.pe', password: '79507732' };

  beforeEach(() => {
    repo = new FakeAuthRepository();
    identityStorage = new FakeIdentityStorage();
    profileStorage = new FakeProfileStorage();
    getProfile = new GetProfileUseCase(profileStorage, repo);
    useCase = new LoginUseCase(repo, identityStorage, getProfile);
  });

  it('login de alumno exitoso devuelve Identity con role student', async () => {
    const identity = makeStudentIdentity();
    repo.willResolveLogin(identity);
    repo.willRejectProfile(new Error('no profile needed in this test'));
    const result = await useCase.execute(credentials);
    expect(result).toBe(identity);
    expect(result.role()).toBe('student');
  });

  it('login exitoso persiste la Identity en storage', async () => {
    const identity = makeStudentIdentity();
    repo.willResolveLogin(identity);
    repo.willRejectProfile(new Error('no profile'));
    await useCase.execute(credentials);
    expect(await identityStorage.read()).toBe(identity);
  });

  it('login de tutor exitoso devuelve Identity con role tutor y codigo null', async () => {
    const identity = makeTutorIdentity();
    repo.willResolveLogin(identity);
    repo.willRejectProfile(new Error('no profile'));
    const result = await useCase.execute({ email: 'tutor1@vonex.pe', password: 'tutor123' });
    expect(result.role()).toBe('tutor');
    expect(result.codigo).toBeNull();
  });

  it('InvalidCredentialsError se propaga sin escribir en storage', async () => {
    repo.willRejectLogin(new InvalidCredentialsError());
    await expect(useCase.execute(credentials)).rejects.toThrow(InvalidCredentialsError);
    expect(await identityStorage.read()).toBeNull();
  });

  it('RateLimitError se propaga', async () => {
    repo.willRejectLogin(new RateLimitError());
    await expect(useCase.execute(credentials)).rejects.toThrow(RateLimitError);
  });

  it('NetworkError se propaga sin tocar storage', async () => {
    repo.willRejectLogin(new NetworkError());
    await expect(useCase.execute(credentials)).rejects.toThrow(NetworkError);
    expect(await identityStorage.read()).toBeNull();
  });

  it('profile fetch falla silenciosamente (fire-and-forget no bloquea)', async () => {
    const identity = makeStudentIdentity();
    repo.willResolveLogin(identity);
    repo.willRejectProfile(new NetworkError('profile fetch failed'));
    // No debe rechazar aunque profile falle
    const result = await useCase.execute(credentials);
    expect(result).toBe(identity);
  });

  it('identity se escribe en storage antes de retornar', async () => {
    const written: Identity[] = [];
    const identity = makeStudentIdentity();
    repo.willResolveLogin(identity);
    repo.willRejectProfile(new Error('no profile'));
    // Espiar el write
    const originalWrite = identityStorage.write.bind(identityStorage);
    identityStorage.write = async (_id: Identity) => {
      written.push(_id);
      return originalWrite(_id);
    };
    await useCase.execute(credentials);
    expect(written).toHaveLength(1);
    expect(written[0]).toBe(identity);
  });

  it('fire-and-forget: execute devuelve identity sin esperar al profile fetch', async () => {
    const identity = makeStudentIdentity();
    repo.willResolveLogin(identity);
    repo.willResolveProfile({
      id: 'p1',
      code: '79507732',
      firstName: 'Gabriel',
      lastName: 'Acuña',
      area: null,
    });
    // execute() debe completar sin importar si el profile fetch terminó
    const result = await useCase.execute(credentials);
    expect(result).toBe(identity);
    // identity ya está en storage independientemente del profile
    expect(await identityStorage.read()).toBe(identity);
    // Dar tick para que fire-and-forget complete sin afectar el resultado
    await new Promise((r) => setTimeout(r, 0));
  });
});
