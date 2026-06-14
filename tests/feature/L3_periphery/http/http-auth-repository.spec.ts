// Tests del adapter L3 `HttpAuthRepository` contra learnex.
//
// Cubre los scenarios del spec `http-client` y `auth-profile`:
// - login/me/refresh/logout/getProfile con shapes reales del back
// - Mapeo de errores HTTP por (status, endpoint, code) — NUNCA por message
// - URLs construidas por `apiPath` (/t/{slug}/...) con el tenantSlug del env
//
// Usamos `HttpTestingController` para responder cada request sin red real.
// Las shapes que flush-ea cada test son las del proposal.md (responses
// verificadas contra learnex al 2026-06-13).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpAuthRepository } from '../../../../src/L3_periphery/http/http-auth-repository';
import { Identity } from '../../../../src/L1_domain/entities/identity';
import { InvalidCredentialsError } from '../../../../src/L1_domain/errors/invalid-credentials.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { RateLimitError } from '../../../../src/L1_domain/errors/rate-limit.error';
import { RefreshFailedError } from '../../../../src/L1_domain/errors/refresh-failed.error';
import { ProfileNotAvailableError } from '../../../../src/L1_domain/errors/profile-not-available.error';
import { SessionExpiredError } from '../../../../src/L1_domain/errors/session-expired.error';
import { environment } from '../../../../src/environments/environment';

const BASE = `${environment.apiBaseUrl}/t/${environment.tenantSlug}`;
const LOGIN_URL = `${BASE}/auth/login`;
const ME_URL = `${BASE}/auth/me`;
const REFRESH_URL = `${BASE}/auth/refresh`;
const LOGOUT_URL = `${BASE}/auth/logout`;
const STUDENT_PROFILE_URL = `${BASE}/student/me`;
const TUTOR_PROFILE_URL = `${BASE}/tutor/me`;

// Shapes literales de los responses reales del proposal (alumno + tutor).
const STUDENT_LOGIN_RESPONSE = {
  user: {
    id: '766aac21-71f9-4f48-a14a-5c2bcebc7d0b',
    email: '79507732@vonex.edu.pe',
    codigo: '79507732',
    roles: ['student'],
    permissions: ['student:dashboard:view', 'student:exams:view'],
    tenantId: '5fff5eec-34dc-40a2-b15e-10e503e7c2dc',
  },
  expiresAt: 1781458612856,
};

const TUTOR_LOGIN_RESPONSE = {
  user: {
    id: '7526d026-7de5-4b99-bd2f-cc95b560f630',
    email: 'tutor1@vonex.pe',
    codigo: null,
    roles: ['tutor'],
    permissions: ['tutor:dashboard:view'],
    tenantId: '5fff5eec-34dc-40a2-b15e-10e503e7c2dc',
  },
  expiresAt: 1781410002223,
};

const STUDENT_PROFILE_RESPONSE = {
  id: '573e8dfa-faf4-4846-b05f-14143710515d',
  code: '79507732',
  firstName: 'Gabriel',
  lastName: 'Acuña Acuña',
  area: null as string | null,
};

const TUTOR_PROFILE_RESPONSE = {
  id: '19cabb89-c81d-4882-91be-3ab0e1414fae',
  code: 'T001',
  firstName: 'Carlos',
  lastName: 'Mendoza',
  email: 'tutor1@vonex.pe',
  classrooms: [
    {
      id: 'a957e020-14d6-41fb-af47-c52531d10b41',
      code: 'LIMA0001',
      name: 'Lima 01',
      modality: 'presencial',
      shift: 'manana',
      campusName: 'Lima Cercado',
      cycleId: 'e720709f-f499-4c77-974b-a4854bdd9632',
      cycleName: 'San Marcos - Semi Anual 0326',
      studentCount: 60,
    },
    {
      id: '5741e2db-a339-4466-99e5-1a4eb1d4339f',
      code: 'LIMA0002',
      name: 'Lima 02',
      modality: 'presencial',
      shift: 'manana',
      campusName: 'Lima San Juan De Lurigancho',
      cycleId: 'e720709f-f499-4c77-974b-a4854bdd9632',
      cycleName: 'San Marcos - Semi Anual 0326',
      studentCount: 60,
    },
  ],
};

describe('HttpAuthRepository', () => {
  let httpMock: HttpTestingController;
  let repo: HttpAuthRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpAuthRepository],
    });
    httpMock = TestBed.inject(HttpTestingController);
    repo = TestBed.inject(HttpAuthRepository);
  });

  afterEach(() => httpMock.verify());

  describe('login', () => {
    const credentials = { email: '79507732@vonex.edu.pe', password: '79507732' };

    it('mapea 200 alumno a Identity con shape exacto del response real', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(LOGIN_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(credentials);
      expect(req.request.withCredentials).toBe(true);
      req.flush(STUDENT_LOGIN_RESPONSE);

      const identity = await pending;
      expect(identity).toBeInstanceOf(Identity);
      expect(identity.id).toBe('766aac21-71f9-4f48-a14a-5c2bcebc7d0b');
      expect(identity.email).toBe('79507732@vonex.edu.pe');
      expect(identity.codigo).toBe('79507732');
      expect(identity.tenantId).toBe('5fff5eec-34dc-40a2-b15e-10e503e7c2dc');
      expect(identity.roles).toEqual(['student']);
      expect(identity.role()).toBe('student');
      expect(identity.expiresAt).toBe(1781458612856);
    });

    it('mapea 200 tutor a Identity con codigo: null y roles: ["tutor"]', async () => {
      const pending = repo.login({ email: 'tutor1@vonex.pe', password: 'tutor123' });
      const req = httpMock.expectOne(LOGIN_URL);
      req.flush(TUTOR_LOGIN_RESPONSE);

      const identity = await pending;
      expect(identity.codigo).toBeNull();
      expect(identity.roles).toEqual(['tutor']);
      expect(identity.role()).toBe('tutor');
    });

    it('mapea 401 con code TENANT_AUTH_INVALID_CREDENTIALS a InvalidCredentialsError', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(LOGIN_URL);
      req.flush(
        { code: 'TENANT_AUTH_INVALID_CREDENTIALS', message: 'cualquier string del back' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(pending).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('mapea 401 sin code a InvalidCredentialsError (fallback anti-enumeration)', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(LOGIN_URL);
      req.flush({}, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('NO lee message del body — code TENANT_AUTH_INVALID_CREDENTIALS gana sobre cualquier message raro', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(LOGIN_URL);
      // El message podría ser cualquier string i18n del back; el adapter
      // debe clasificar por el `code` estructurado.
      req.flush(
        { code: 'TENANT_AUTH_INVALID_CREDENTIALS', message: 'lo que sea' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(pending).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('mapea 429 a RateLimitError', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(LOGIN_URL);
      req.flush({ code: 'TENANT_AUTH_RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });
      await expect(pending).rejects.toBeInstanceOf(RateLimitError);
    });

    it('mapea 500 a NetworkError', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(LOGIN_URL);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('mapea fallo de transporte (status 0) a NetworkError', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(LOGIN_URL);
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network failure' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe('me', () => {
    it('mapea 200 a Identity', async () => {
      const pending = repo.me();
      const req = httpMock.expectOne(ME_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.withCredentials).toBe(true);
      req.flush(STUDENT_LOGIN_RESPONSE);

      const identity = await pending;
      expect(identity).toBeInstanceOf(Identity);
      expect(identity.email).toBe('79507732@vonex.edu.pe');
    });

    it('mapea 401 a SessionExpiredError', async () => {
      const pending = repo.me();
      const req = httpMock.expectOne(ME_URL);
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('mapea 500 a NetworkError', async () => {
      const pending = repo.me();
      const req = httpMock.expectOne(ME_URL);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe('refresh', () => {
    it('mapea 200 a Identity actualizada', async () => {
      const pending = repo.refresh();
      const req = httpMock.expectOne(REFRESH_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush(STUDENT_LOGIN_RESPONSE);

      const identity = await pending;
      expect(identity).toBeInstanceOf(Identity);
      expect(identity.id).toBe('766aac21-71f9-4f48-a14a-5c2bcebc7d0b');
    });

    it('mapea 401 con code TENANT_AUTH_REFRESH_TOKEN_INVALID a RefreshFailedError', async () => {
      const pending = repo.refresh();
      const req = httpMock.expectOne(REFRESH_URL);
      req.flush(
        { code: 'TENANT_AUTH_REFRESH_TOKEN_INVALID' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(pending).rejects.toBeInstanceOf(RefreshFailedError);
    });

    it('mapea 401 con code TENANT_AUTH_REFRESH_TOKEN_MISSING a RefreshFailedError', async () => {
      const pending = repo.refresh();
      const req = httpMock.expectOne(REFRESH_URL);
      req.flush(
        { code: 'TENANT_AUTH_REFRESH_TOKEN_MISSING' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(pending).rejects.toBeInstanceOf(RefreshFailedError);
    });

    it('mapea 401 sin code a RefreshFailedError (fallback — no podemos seguir)', async () => {
      const pending = repo.refresh();
      const req = httpMock.expectOne(REFRESH_URL);
      req.flush({}, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toBeInstanceOf(RefreshFailedError);
    });
  });

  describe('logout', () => {
    it('204 resuelve sin error', async () => {
      const pending = repo.logout();
      const req = httpMock.expectOne(LOGOUT_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await expect(pending).resolves.toBeUndefined();
    });

    it('5xx propaga el error (best-effort lo maneja el use case caller)', async () => {
      const pending = repo.logout();
      const req = httpMock.expectOne(LOGOUT_URL);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeTruthy();
    });
  });

  describe('getProfile', () => {
    it('student: mapea 200 a StudentProfile con shape del proposal (Gabriel Acuña)', async () => {
      const pending = repo.getProfile('student');
      const req = httpMock.expectOne(STUDENT_PROFILE_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.withCredentials).toBe(true);
      req.flush(STUDENT_PROFILE_RESPONSE);

      const profile = await pending;
      expect(profile).toEqual({
        id: '573e8dfa-faf4-4846-b05f-14143710515d',
        code: '79507732',
        firstName: 'Gabriel',
        lastName: 'Acuña Acuña',
        area: null,
      });
    });

    it('tutor: mapea 200 a TutorProfile con 2 aulas (Lima 01/02)', async () => {
      const pending = repo.getProfile('tutor');
      const req = httpMock.expectOne(TUTOR_PROFILE_URL);
      expect(req.request.method).toBe('GET');
      req.flush(TUTOR_PROFILE_RESPONSE);

      const profile = await pending;
      expect(profile.id).toBe('19cabb89-c81d-4882-91be-3ab0e1414fae');
      expect(profile.code).toBe('T001');
      expect(profile.firstName).toBe('Carlos');
      expect(profile.lastName).toBe('Mendoza');
      expect('email' in profile && profile.email).toBe('tutor1@vonex.pe');
      expect('classrooms' in profile && profile.classrooms.length).toBe(2);
      if ('classrooms' in profile) {
        expect(profile.classrooms[0].name).toBe('Lima 01');
        expect(profile.classrooms[1].name).toBe('Lima 02');
        expect(profile.classrooms[0].studentCount).toBe(60);
      }
    });

    it('student: mapea 401 a SessionExpiredError', async () => {
      const pending = repo.getProfile('student');
      const req = httpMock.expectOne(STUDENT_PROFILE_URL);
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('student: mapea 403 a ProfileNotAvailableError', async () => {
      const pending = repo.getProfile('student');
      const req = httpMock.expectOne(STUDENT_PROFILE_URL);
      req.flush(null, { status: 403, statusText: 'Forbidden' });
      await expect(pending).rejects.toBeInstanceOf(ProfileNotAvailableError);
    });

    it('student: mapea 404 a ProfileNotAvailableError', async () => {
      const pending = repo.getProfile('student');
      const req = httpMock.expectOne(STUDENT_PROFILE_URL);
      req.flush(null, { status: 404, statusText: 'Not Found' });
      await expect(pending).rejects.toBeInstanceOf(ProfileNotAvailableError);
    });

    it('student: mapea 500 a NetworkError', async () => {
      const pending = repo.getProfile('student');
      const req = httpMock.expectOne(STUDENT_PROFILE_URL);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe('URLs vía apiPath — todas pegan a /t/${tenantSlug}/...', () => {
    it('login pega a /t/${tenantSlug}/auth/login', async () => {
      const pending = repo.login({ email: 'a@b.test', password: 'x' });
      const req = httpMock.expectOne(LOGIN_URL);
      expect(req.request.url).toBe(`${environment.apiBaseUrl}/t/${environment.tenantSlug}/auth/login`);
      req.flush(STUDENT_LOGIN_RESPONSE);
      await pending;
    });

    it('me pega a /t/${tenantSlug}/auth/me', async () => {
      const pending = repo.me();
      const req = httpMock.expectOne(ME_URL);
      expect(req.request.url).toBe(`${environment.apiBaseUrl}/t/${environment.tenantSlug}/auth/me`);
      req.flush(STUDENT_LOGIN_RESPONSE);
      await pending;
    });

    it('profile(student) pega a /t/${tenantSlug}/student/me', async () => {
      const pending = repo.getProfile('student');
      const req = httpMock.expectOne(STUDENT_PROFILE_URL);
      expect(req.request.url).toBe(`${environment.apiBaseUrl}/t/${environment.tenantSlug}/student/me`);
      req.flush(STUDENT_PROFILE_RESPONSE);
      await pending;
    });

    it('profile(tutor) pega a /t/${tenantSlug}/tutor/me', async () => {
      const pending = repo.getProfile('tutor');
      const req = httpMock.expectOne(TUTOR_PROFILE_URL);
      expect(req.request.url).toBe(`${environment.apiBaseUrl}/t/${environment.tenantSlug}/tutor/me`);
      req.flush(TUTOR_PROFILE_RESPONSE);
      await pending;
    });
  });
});
