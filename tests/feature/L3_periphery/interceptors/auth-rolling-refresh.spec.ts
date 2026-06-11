import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authHeadersInterceptor } from '../../../../src/L3_periphery/interceptors/auth-headers.interceptor';
import { LocalStorageSessionStorage } from '../../../../src/L3_periphery/storage/local-storage-session-storage';
import { ActualizarBearerSiRenovadoUseCase } from '../../../../src/L2_application/use-cases/actualizar-bearer-si-renovado.use-case';
import { SessionStorage } from '../../../../src/L1_domain/ports/session-storage';
import { Session } from '../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';
import { environment } from '../../../../src/environments/environment';

// El interceptor lee storage.read() (async) ANTES de enviar el request, y
// además dispara el use case fire-and-forget DESPUÉS de recibir la respuesta.
// Ambos puntos son microtask boundaries. Un `setTimeout(0)` deja correr toda
// la cola pendiente. Lo usamos como barrera explícita en cada test.
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('authHeadersInterceptor — rolling bearer refresh', () => {
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
        // El interceptor inyecta `ActualizarBearerSiRenovadoUseCase` directo
        // (no por token). Lo proveemos con una factory que recibe el storage
        // real para que la persistencia del bearer renovado sea observable
        // vía `LocalStorageSessionStorage.read()` en cada assertion.
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

  // Spec Scenario: Backend envía nuevo bearer en respuesta a GET /simulacros
  it('actualiza la sesión cuando la respuesta de GET /simulacros trae X-New-Bearer', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    http.get(`${environment.apiBaseUrl}/simulacros`).subscribe();
    await flushMicrotasks();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer A|old');
    req.flush(
      { simulacros: [] },
      { status: 200, statusText: 'OK', headers: { 'X-New-Bearer': 'B|new' } },
    );

    // El interceptor invoca el use case fire-and-forget tras flush(); damos
    // un tick para que la promesa de storage.write se resuelva.
    await flushMicrotasks();

    const persisted = await storage.read();
    expect(persisted).not.toBeNull();
    expect(persisted!.bearerToken.value).toBe('B|new');
    expect(persisted!.userEmail).toBe('fulano@panda.test');
  });

  it('los próximos requests usan el bearer renovado tras X-New-Bearer', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    http.get(`${environment.apiBaseUrl}/simulacros`).subscribe();
    await flushMicrotasks();
    const first = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    first.flush(
      { simulacros: [] },
      { status: 200, statusText: 'OK', headers: { 'X-New-Bearer': 'B|new' } },
    );
    await flushMicrotasks();

    http.get(`${environment.apiBaseUrl}/simulacros`).subscribe();
    await flushMicrotasks();
    const second = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    expect(second.request.headers.get('Authorization')).toBe('Bearer B|new');
    second.flush({ simulacros: [] });
  });

  // Spec Scenario: Respuesta sin header de renovación no toca la sesión
  it('respuesta sin X-New-Bearer no muta la sesión persistida', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    http.get(`${environment.apiBaseUrl}/simulacros`).subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    req.flush({ simulacros: [] }, { status: 200, statusText: 'OK' });
    await flushMicrotasks();

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('A|old');
  });

  // Spec Scenario: Renovación en cualquier endpoint autenticado, no solo GET /simulacros
  it('renueva el bearer ante POST /simulacros/:id/envio con X-New-Bearer', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    const url = `${environment.apiBaseUrl}/simulacros/abc-123/envio`;
    http.post(url, { respuestas: {} }).subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    req.flush(
      { ok: true },
      { status: 200, statusText: 'OK', headers: { 'X-New-Bearer': 'C|fromPost' } },
    );
    await flushMicrotasks();

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('C|fromPost');
  });

  it('renueva el bearer ante GET /auth/me con X-New-Bearer (endpoint agnóstico)', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    http.get(`${environment.apiBaseUrl}/auth/me`).subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/me`);
    req.flush(
      { user: { email: 'fulano@panda.test' } },
      { status: 200, statusText: 'OK', headers: { 'X-New-Bearer': 'D|fromMe' } },
    );
    await flushMicrotasks();

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('D|fromMe');
  });

  // Spec Scenario: Renovación silenciosa — sin re-render de la UI
  // No es directamente testeable sin componentes. Lo cubrimos verificando que
  // el response que ve el caller pasa intacto (body + status + headers), así
  // que ningún view-model puede observar diferencia ni ser empujado a render.
  it('renovación silenciosa: el response que recibe el caller no se altera', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    const observedBody: unknown[] = [];
    const observedResponses: HttpResponse<unknown>[] = [];
    const expectedBody = { simulacros: [{ id: 'abc' }], total: 1 };

    // Body via .subscribe() — lo que ven los use cases normales.
    http.get(`${environment.apiBaseUrl}/simulacros`).subscribe((body) => observedBody.push(body));
    await flushMicrotasks();
    const req1 = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    req1.flush(expectedBody, {
      status: 200,
      statusText: 'OK',
      headers: { 'X-New-Bearer': 'B|new', 'X-Custom': 'preserved' },
    });
    await flushMicrotasks();
    expect(observedBody).toEqual([expectedBody]);

    // Full HttpResponse via observe:'response' — confirma que headers y status
    // pasan intactos al caller (no se filtran ni mutan por el tap interno).
    http
      .get(`${environment.apiBaseUrl}/simulacros`, { observe: 'response' })
      .subscribe((res) => observedResponses.push(res));
    await flushMicrotasks();
    const req2 = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    req2.flush(expectedBody, {
      status: 200,
      statusText: 'OK',
      headers: { 'X-New-Bearer': 'C|new2', 'X-Custom': 'preserved' },
    });
    await flushMicrotasks();
    expect(observedResponses).toHaveLength(1);
    expect(observedResponses[0].status).toBe(200);
    expect(observedResponses[0].body).toEqual(expectedBody);
    expect(observedResponses[0].headers.get('X-New-Bearer')).toBe('C|new2');
    expect(observedResponses[0].headers.get('X-Custom')).toBe('preserved');
  });

  // Spec Scenario: Bearer renovado vacío rechazado
  it('X-New-Bearer vacío no muta la sesión persistida', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    http.get(`${environment.apiBaseUrl}/simulacros`).subscribe();
    await flushMicrotasks();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    // HttpHeaders normaliza un valor vacío a `null` cuando se consulta con
    // `.get()` — el interceptor lo trata como "header ausente" y no dispara
    // el use case. Esto es lo que queremos verificar.
    req.flush(
      { simulacros: [] },
      { status: 200, statusText: 'OK', headers: { 'X-New-Bearer': '' } },
    );
    await flushMicrotasks();

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('A|old');
  });

  // Spec Scenario: Bearer expirado sin renovación previa
  // El interceptor del rolling refresh NO debe interferir con la propagación
  // del 401 al caller. La lógica de logout silencioso vive aguas arriba
  // (guards / interceptor de auth de Fase 1), pero el caller HTTP DEBE seguir
  // recibiendo el HttpErrorResponse 401 tal cual.
  it('401 sin X-New-Bearer se propaga como error al caller (no es silenciado)', async () => {
    await storage.write(
      new Session(new BearerToken('A|old'), 'fulano@panda.test', new Date('2026-06-11T12:00:00Z')),
    );

    let caughtError: HttpErrorResponse | null = null;
    http.get(`${environment.apiBaseUrl}/simulacros`).subscribe({
      next: () => {
        throw new Error('no debería emitir next ante un 401');
      },
      error: (err: HttpErrorResponse) => {
        caughtError = err;
      },
    });
    await flushMicrotasks();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/simulacros`);
    // Body cualquiera — recordatorio: clasificamos por status, no por message.
    req.flush(
      { message: 'whatever-string-del-backend' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await flushMicrotasks();

    expect(caughtError).not.toBeNull();
    expect(caughtError!.status).toBe(401);

    // La sesión NO debe haber sido tocada por la lógica nueva — el cleanup
    // ante 401 es responsabilidad de Fase 1, fuera de scope de este test.
    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('A|old');
  });
});
