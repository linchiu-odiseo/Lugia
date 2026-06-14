import { describe, it, expect, beforeEach } from 'vitest';
import { InitializeSessionUseCase } from '../../../../src/L2_application/use-cases/initialize-session.use-case';
import { Identity } from '../../../../src/L1_domain/entities/identity';
import { SessionExpiredError } from '../../../../src/L1_domain/errors/session-expired.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { FakeAuthRepository } from '../../fixtures/auth-repository.fake';
import { FakeIdentityStorage } from '../../fixtures/identity-storage.fake';
import { FakeProfileStorage } from '../../fixtures/profile-storage.fake';
import { GetProfileUseCase } from '../../../../src/L2_application/use-cases/get-profile.use-case';

const NOW = 1_700_000_000_000;

const makeStudentIdentity = () =>
  new Identity('uid', 'tid', 'alumno@vonex.edu.pe', '79507732', ['student'], [], NOW + 900_000);

const makeTutorIdentity = () =>
  new Identity('uid2', 'tid', 'tutor@vonex.pe', null, ['tutor'], [], NOW + 900_000);

describe('InitializeSessionUseCase', () => {
  let repo: FakeAuthRepository;
  let identityStorage: FakeIdentityStorage;
  let profileStorage: FakeProfileStorage;
  let getProfile: GetProfileUseCase;
  let useCase: InitializeSessionUseCase;

  beforeEach(() => {
    repo = new FakeAuthRepository();
    identityStorage = new FakeIdentityStorage();
    profileStorage = new FakeProfileStorage();
    getProfile = new GetProfileUseCase(profileStorage, repo);
    useCase = new InitializeSessionUseCase(repo, identityStorage, getProfile);
  });

  it('happy path student: persiste identity y devuelve Identity', async () => {
    const identity = makeStudentIdentity();
    repo.willResolveMe(identity);
    repo.willRejectProfile(new Error('no profile needed'));
    const result = await useCase.execute();
    expect(result).toBe(identity);
    expect(await identityStorage.read()).toBe(identity);
  });

  it('happy path tutor: persiste identity y devuelve Identity', async () => {
    const identity = makeTutorIdentity();
    repo.willResolveMe(identity);
    repo.willRejectProfile(new Error('no profile needed'));
    const result = await useCase.execute();
    expect(result?.role()).toBe('tutor');
  });

  it('SessionExpiredError (401) → limpia storage y devuelve null', async () => {
    const identity = makeStudentIdentity();
    await identityStorage.write(identity);
    repo.willRejectMe(new SessionExpiredError());
    const result = await useCase.execute();
    expect(result).toBeNull();
    expect(await identityStorage.read()).toBeNull();
  });

  it('NetworkError → storage no se toca y el error se propaga', async () => {
    const identity = makeStudentIdentity();
    await identityStorage.write(identity);
    repo.willRejectMe(new NetworkError());
    await expect(useCase.execute()).rejects.toThrow(NetworkError);
    // Storage intacto (offline-tolerante)
    expect(await identityStorage.read()).toBe(identity);
  });

  it('storage ya vacío cuando SessionExpiredError → no falla (no-op en clear)', async () => {
    repo.willRejectMe(new SessionExpiredError());
    // No hay identity previa en storage
    await expect(useCase.execute()).resolves.toBeNull();
  });

  it('profile fetch que falla es silencioso (fire-and-forget)', async () => {
    const identity = makeStudentIdentity();
    repo.willResolveMe(identity);
    repo.willRejectProfile(new NetworkError('profile 503'));
    // No debe rechazar
    const result = await useCase.execute();
    expect(result).toBe(identity);
  });
});
