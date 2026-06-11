import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpAuthRepository } from '../../../../src/L3_periphery/http/http-auth-repository';
import { Session } from '../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';
import { InvalidCredentialsError } from '../../../../src/L1_domain/errors/invalid-credentials.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { environment } from '../../../../src/environments/environment';

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
    const credentials = { email: 'fulano@panda.test', password: '12345678' };

    it('mapea 200 a Session con BearerToken y userEmail del body', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(credentials);
      req.flush({
        token: '6|lP2nsQrVOVE',
        user: { email: 'fulano@panda.test', name: 'fulano Demo' },
      });
      const session = await pending;
      expect(session.bearerToken.value).toBe('6|lP2nsQrVOVE');
      expect(session.userEmail).toBe('fulano@panda.test');
      expect(session.issuedAt).toBeInstanceOf(Date);
    });

    it('mapea 401 a InvalidCredentialsError sin depender del mensaje', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush(
        { message: 'cualquier-string-que-cambie' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(pending).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('mapea 500 a NetworkError', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('mapea 503 a NetworkError', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('mapea fallo de transporte (status 0) a NetworkError', async () => {
      const pending = repo.login(credentials);
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network failure' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe('logout', () => {
    it('llama POST /auth/logout', async () => {
      const session = new Session(new BearerToken('6|abc'), 'a@b.com', new Date());
      const pending = repo.logout(session);
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/logout`);
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await expect(pending).resolves.toBeUndefined();
    });
  });
});
