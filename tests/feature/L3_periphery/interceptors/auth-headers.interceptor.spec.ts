import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { authHeadersInterceptor } from '../../../../src/L3_periphery/interceptors/auth-headers.interceptor';
import { LocalStorageSessionStorage } from '../../../../src/L3_periphery/storage/local-storage-session-storage';
import { ActualizarBearerSiRenovadoUseCase } from '../../../../src/L2_application/use-cases/actualizar-bearer-si-renovado.use-case';
import { SessionStorage } from '../../../../src/L1_domain/ports/session-storage';
import { Session } from '../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';
import { environment } from '../../../../src/environments/environment';

// El interceptor llama storage.read() (async) antes de enviar el request.
// Para que httpMock.expectOne vea el request, hay que dejar correr los
// microtasks que resuelven la promesa del storage.
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('authHeadersInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let storage: LocalStorageSessionStorage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authHeadersInterceptor])),
        provideHttpClientTesting(),
        LocalStorageSessionStorage,
        // El interceptor inyecta `ActualizarBearerSiRenovadoUseCase` para el
        // rolling refresh (Fase 2). Los tests de Fase 1 abajo no asertean
        // sobre el renew, pero el provider debe existir o la DI explota.
        {
          provide: ActualizarBearerSiRenovadoUseCase,
          useFactory: (s: SessionStorage) => new ActualizarBearerSiRenovadoUseCase(s),
          deps: [LocalStorageSessionStorage],
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(LocalStorageSessionStorage);
  });

  afterEach(() => {
    try {
      httpMock.verify();
    } finally {
      localStorage.clear();
    }
  });

  it('inyecta X-API-Key en requests a API-FAKE sin sesión activa', async () => {
    http.post(`${environment.apiBaseUrl}/auth/login`, { email: 'a', password: 'b' }).subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.headers.get('X-API-Key')).toBe(environment.apiKey);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('inyecta X-API-Key Y Authorization Bearer cuando hay sesión persistida', async () => {
    await storage.write(new Session(new BearerToken('6|abc'), 'fulano@panda.test', new Date()));
    http.get(`${environment.apiBaseUrl}/auth/me`).subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/me`);
    expect(req.request.headers.get('X-API-Key')).toBe(environment.apiKey);
    expect(req.request.headers.get('Authorization')).toBe('Bearer 6|abc');
    req.flush({});
  });

  it('NO toca headers en requests a hosts externos (fuera de apiBaseUrl)', async () => {
    http.get('http://other-host.example/data').subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne('http://other-host.example/data');
    expect(req.request.headers.has('X-API-Key')).toBe(false);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('preserva headers preexistentes del request', async () => {
    http
      .post(
        `${environment.apiBaseUrl}/auth/login`,
        {},
        { headers: { 'X-Trace-Id': 'trace-123' } },
      )
      .subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.headers.get('X-Trace-Id')).toBe('trace-123');
    expect(req.request.headers.get('X-API-Key')).toBe(environment.apiKey);
    req.flush({});
  });
});
