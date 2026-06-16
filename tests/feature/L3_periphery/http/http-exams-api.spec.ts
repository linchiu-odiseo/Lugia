import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpExamsApi } from '../../../../src/L3_periphery/http/http-exams-api';
import { Exam } from '../../../../src/L1_domain/entities/exam';
import { ServerTime } from '../../../../src/L1_domain/value-objects/server-time';
import { InvalidExamError } from '../../../../src/L1_domain/errors/invalid-exam.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { ExamsPermissionRevokedError } from '../../../../src/L1_domain/errors/exams-permission-revoked.error';
import { StudentNotLinkedError } from '../../../../src/L1_domain/errors/student-not-linked.error';
import { environment } from '../../../../src/environments/environment';

// Cubre `HttpExamsApi.getTodaysExams()` (L3): hit a
// `/t/{slug}/student/exam-sessions`, mapeo de DTO → Exam, skip silencioso
// del item malformado y clasificación de errores por `(status, body.code)`.
// IMPORTANTE: nunca asertamos sobre `message` del body — solo por (status, code).
describe('HttpExamsApi', () => {
  let httpMock: HttpTestingController;
  let adapter: HttpExamsApi;

  // El path se arma desde environment para que cambios en tenantSlug se
  // propaguen sin tocar tests.
  const EXAMS_URL = `${environment.apiBaseUrl}/t/${environment.tenantSlug}/student/exam-sessions`;

  // DTO base válido para componer respuestas (ExamDto del adapter).
  const dtoFor = (
    overrides: Partial<{
      id: string;
      area: string | null;
      course: string | null;
      type: string;
      name: string;
      count: number;
      duration: number;
      status: 'scheduled' | 'in_progress' | 'finalized';
      scheduled: string;
      started: string | null;
      finished: string | null;
    }> = {},
  ) => ({
    id: 'exam-1',
    area: 'Matemática',
    course: 'Aritmética',
    type: 'simulacro',
    name: 'Examen 1',
    count: 20,
    duration: 3600,
    status: 'in_progress' as 'scheduled' | 'in_progress' | 'finalized',
    scheduled: '2026-06-11T10:00:00Z',
    started: '2026-06-11T10:00:05Z',
    finished: null,
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpExamsApi],
    });
    httpMock = TestBed.inject(HttpTestingController);
    adapter = TestBed.inject(HttpExamsApi);
  });

  afterEach(() => httpMock.verify());

  describe('getTodaysExams — happy path', () => {
    it('hace GET a /t/{slug}/student/exam-sessions y mapea exámenes + serverTime', async () => {
      const pending = adapter.getTodaysExams();

      const req = httpMock.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.endsWith(`/t/${environment.tenantSlug}/student/exam-sessions`),
      );
      expect(req.request.method).toBe('GET');

      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        exams: [
          dtoFor({ id: 'exam-1', status: 'in_progress' }),
          dtoFor({
            id: 'exam-2',
            status: 'scheduled',
            area: 'Comunicación',
            started: null,
          }),
          dtoFor({
            id: 'exam-3',
            status: 'finalized',
            finished: '2026-06-11T11:00:00Z',
          }),
        ],
      });

      const result = await pending;

      expect(result.serverTime).toBeInstanceOf(ServerTime);
      expect(result.serverTime.toMillis()).toBe(new Date('2026-06-11T11:30:00Z').getTime());

      expect(result.exams).toHaveLength(3);
      expect(result.exams[0]).toBeInstanceOf(Exam);
      expect(result.exams[0].id).toBe('exam-1');
      expect(result.exams[0].serverStatus.value).toBe('in_progress');
      expect(result.exams[0].scheduled).toEqual(new Date('2026-06-11T10:00:00Z'));
      expect(result.exams[0].started).toEqual(new Date('2026-06-11T10:00:05Z'));

      expect(result.exams[1].id).toBe('exam-2');
      expect(result.exams[1].area).toBe('Comunicación');
      expect(result.exams[1].serverStatus.value).toBe('scheduled');
      expect(result.exams[1].started).toBeNull();

      expect(result.exams[2].id).toBe('exam-3');
      expect(result.exams[2].serverStatus.value).toBe('finalized');
      expect(result.exams[2].finished).toEqual(new Date('2026-06-11T11:00:00Z'));
    });

    it('acepta area: null y course: null tal cual', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        exams: [dtoFor({ area: null, course: null, status: 'scheduled', started: null })],
      });

      const result = await pending;
      expect(result.exams[0].area).toBeNull();
      expect(result.exams[0].course).toBeNull();
    });

    it('lista vacía: result.exams es array vacío y serverTime sigue presente', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({
        serverTime: '2026-06-11T08:00:00Z',
        exams: [],
      });

      const result = await pending;
      expect(result.exams).toEqual([]);
      expect(result.serverTime).toBeInstanceOf(ServerTime);
      expect(result.serverTime.toMillis()).toBe(new Date('2026-06-11T08:00:00Z').getTime());
    });

    it.each(['scheduled', 'in_progress', 'finalized'] as const)(
      'mapea correctamente status "%s" del DTO a ExamServerStatus',
      async (status) => {
        const pending = adapter.getTodaysExams();
        const req = httpMock.expectOne(EXAMS_URL);
        req.flush({
          serverTime: '2026-06-11T11:30:00Z',
          exams: [
            dtoFor({
              status,
              // started debe ser null SOLO para scheduled; in_progress y finalized lo necesitan.
              started: status === 'scheduled' ? null : '2026-06-11T10:00:05Z',
            }),
          ],
        });

        const result = await pending;
        expect(result.exams[0].serverStatus.value).toBe(status);
      },
    );
  });

  describe('getTodaysExams — skip silencioso de item malformado', () => {
    it('excluye el item con status=in_progress + started=null y emite console.warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        exams: [
          // Válido — in_progress con started.
          dtoFor({ id: 'exam-valid', status: 'in_progress' }),
          // Malformado: in_progress sin started.
          dtoFor({ id: 'exam-malformed', status: 'in_progress', started: null }),
          // Otro válido — scheduled (started null es legítimo acá).
          dtoFor({ id: 'exam-scheduled', status: 'scheduled', started: null }),
        ],
      });

      const result = await pending;

      // El malformado fue excluido.
      expect(result.exams.map((e) => e.id)).toEqual(['exam-valid', 'exam-scheduled']);
      // console.warn se llamó exactamente una vez con el formato esperado.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toBe('[ExamsApi] Skipping malformed exam');
      expect(warnSpy.mock.calls[0][1]).toMatchObject({
        id: 'exam-malformed',
        reason: 'in_progress without started',
      });

      warnSpy.mockRestore();
    });
  });

  describe('getTodaysExams — rechazos por DTO inválido (entidad lanza)', () => {
    it('status fuera del set permitido propaga InvalidExamError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        exams: [
          dtoFor({
            status: 'pendiente' as unknown as 'scheduled',
          }),
        ],
      });

      await expect(pending).rejects.toBeInstanceOf(InvalidExamError);
    });

    it('scheduled no-ISO8601 propaga InvalidExamError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        exams: [dtoFor({ scheduled: 'no-es-fecha' })],
      });

      await expect(pending).rejects.toBeInstanceOf(InvalidExamError);
    });

    it('started no-ISO8601 propaga InvalidExamError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        exams: [dtoFor({ started: 'tampoco-es-fecha' })],
      });

      await expect(pending).rejects.toBeInstanceOf(InvalidExamError);
    });
  });

  describe('getTodaysExams — clasificación HTTP → errores de dominio', () => {
    // NOTA: 401 lo absorbe `credentials.interceptor` (refresh + redirect login).
    // El adapter NO lo clasifica, así que NO testeamos 401 acá.

    it('403 → ExamsPermissionRevokedError (cuerpo ignorado)', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush(
        { message: 'cualquier-string-volátil-del-backend' },
        { status: 403, statusText: 'Forbidden' },
      );
      await expect(pending).rejects.toBeInstanceOf(ExamsPermissionRevokedError);
    });

    it('404 con body code STUDENT_NOT_LINKED → StudentNotLinkedError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush(
        { code: 'STUDENT_NOT_LINKED', message: 'message-irrelevante' },
        { status: 404, statusText: 'Not Found' },
      );
      await expect(pending).rejects.toBeInstanceOf(StudentNotLinkedError);
    });

    it('404 sin code conocido → NetworkError (fallback)', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({ message: 'sin-code' }, { status: 404, statusText: 'Not Found' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('404 con code distinto a STUDENT_NOT_LINKED → NetworkError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush(
        { code: 'OTRO_CODE', message: 'algo' },
        { status: 404, statusText: 'Not Found' },
      );
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('500 → NetworkError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('503 → NetworkError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('429 → NetworkError (backoff diferido a change futuro)', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.flush({ message: 'rate' }, { status: 429, statusText: 'Too Many' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('fallo de transporte (status 0) → NetworkError', async () => {
      const pending = adapter.getTodaysExams();
      const req = httpMock.expectOne(EXAMS_URL);
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network failure' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });

  // Los tests de `enviar()` viven en su propio archivo
  // `http-exams-api-enviar.spec.ts`. Acá solo cubrimos
  // GET /t/{slug}/student/exam-sessions.
});
