import { describe, it, expect, beforeEach } from 'vitest';
import { GetProfileUseCase } from '../../../../src/L2_application/use-cases/get-profile.use-case';
import { StudentProfile } from '../../../../src/L1_domain/value-objects/student-profile';
import { ProfileNotAvailableError } from '../../../../src/L1_domain/errors/profile-not-available.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { FakeAuthRepository } from '../../fixtures/auth-repository.fake';
import { FakeProfileStorage } from '../../fixtures/profile-storage.fake';

const NOW = 1_700_000_000_000;
const TTL_24H = 24 * 60 * 60 * 1000;

const sampleStudentProfile: StudentProfile = {
  id: '573e8dfa-faf4-4846-b05f-14143710515d',
  code: '79507732',
  firstName: 'Gabriel',
  lastName: 'Acuña Acuña',
  area: null,
};

const updatedStudentProfile: StudentProfile = {
  ...sampleStudentProfile,
  firstName: 'Gabriel Updated',
};

describe('GetProfileUseCase', () => {
  let repo: FakeAuthRepository;
  let profileStorage: FakeProfileStorage;
  let useCase: GetProfileUseCase;

  beforeEach(() => {
    repo = new FakeAuthRepository();
    profileStorage = new FakeProfileStorage();
    useCase = new GetProfileUseCase(profileStorage, repo, () => NOW);
  });

  it('cache hit fresco (< 24h) → devuelve profile sin fetch', async () => {
    profileStorage.seed('student', sampleStudentProfile, NOW - 3600_000); // hace 1h
    const result = await useCase.execute('student');
    expect(result).toBe(sampleStudentProfile);
    expect(repo.getProfileCalls()).toHaveLength(0); // no fetcha
  });

  it('cache miss → fetcha y escribe en storage', async () => {
    repo.willResolveProfile(sampleStudentProfile);
    const result = await useCase.execute('student');
    expect(result).toEqual(sampleStudentProfile);
    expect(repo.getProfileCalls()).toEqual(['student']);
    // Verificar que quedó en storage
    const cached = await profileStorage.read('student');
    expect(cached?.profile).toEqual(sampleStudentProfile);
  });

  it('cache stale (> 24h) → fetcha y reemplaza el cache', async () => {
    profileStorage.seed('student', sampleStudentProfile, NOW - TTL_24H - 1); // hace 25h
    repo.willResolveProfile(updatedStudentProfile);
    const result = await useCase.execute('student');
    expect(result).toEqual(updatedStudentProfile);
    expect(repo.getProfileCalls()).toHaveLength(1);
  });

  it('fetch devuelve perfil diferente al cache stale → reemplaza', async () => {
    profileStorage.seed('student', sampleStudentProfile, NOW - TTL_24H - 3600_000);
    repo.willResolveProfile(updatedStudentProfile);
    const result = await useCase.execute('student');
    expect((result as StudentProfile).firstName).toBe('Gabriel Updated');
  });

  it('ProfileNotAvailableError del repo se propaga', async () => {
    repo.willRejectProfile(new ProfileNotAvailableError());
    await expect(useCase.execute('student')).rejects.toThrow(ProfileNotAvailableError);
  });

  it('NetworkError del repo se propaga', async () => {
    repo.willRejectProfile(new NetworkError());
    await expect(useCase.execute('student')).rejects.toThrow(NetworkError);
  });
});
