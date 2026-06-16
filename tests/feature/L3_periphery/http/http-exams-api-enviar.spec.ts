import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpSimulacrosApi } from '../../../../src/L3_periphery/http/http-simulacros-api';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { SessionExpiredError } from '../../../../src/L1_domain/errors/session-expired.error';
import { InvalidSubmissionTimeError } from '../../../../src/L1_domain/errors/invalid-submission-time.error';
import { InvalidPayloadError } from '../../../../src/L1_domain/errors/invalid-payload.error';
import { SimulacroCerradoError } from '../../../../src/L1_domain/errors/simulacro-cerrado.error';
import { SimulacroNoAsignadoError } from '../../../../src/L1_domain/errors/simulacro-no-asignado.error';
import { environment } from '../../../../src/environments/environment';

// Cubre el mapeo HTTP → errores de dominio de `HttpSimulacrosApi.enviar()`
// según `openspec/changes/cartilla-fase-2/specs/exam-submission/spec.md`
// Req 1 (200/409 idempotencia), Req 5 (clasificación por status/code).
//
// IMPORTANTE: Nunca matcheamos el `message` del body. Toda decisión se
// toma por (status, code) según la regla del repo.
describe('HttpSimulacrosApi.enviar', () => {
  let httpMock: HttpTestingController;
  let adapter: HttpSimulacrosApi;

  const SIM_ID = 'sim-1';
  const REQ_TS = '2026-06-11T08:55:00.000Z';
  const SRV_TS = '2026-06-11T08:55:01.000Z';
  const url = (id: string) =>
    `${environment.apiBaseUrl}/simulacros/${encodeURIComponent(id)}/envio`;

  const defaultReq = {
    simulacroId: SIM_ID,
    answers: { '1': 'A' as const, '2': 'B' as const },
    clientSubmittedAt: REQ_TS,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpSimulacrosApi],
    });
    httpMock = TestBed.inject(HttpTestingController);
    adapter = TestBed.inject(HttpSimulacrosApi);
  });

  afterEach(() => httpMock.verify());

  describe('request shape', () => {
    it('POST a /simulacros/{id}/envio con body { answers, clientSubmittedAt }', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        answers: { '1': 'A', '2': 'B' },
        clientSubmittedAt: REQ_TS,
      });
      req.flush({
        status: 'enviado',
        clientSubmittedAt: REQ_TS,
        serverReceivedAt: SRV_TS,
      });
      await pending;
    });

    it('URL aplica encodeURIComponent al simulacroId con caracteres especiales', async () => {
      const tricky = 'sim/with?special&chars';
      const pending = adapter.enviar({
        simulacroId: tricky,
        answers: {},
        clientSubmittedAt: REQ_TS,
      });
      // El URL esperado debe tener el id encoded; expectOne con string exacta.
      const req = httpMock.expectOne(url(tricky));
      expect(req.request.url).toBe(
        `${environment.apiBaseUrl}/simulacros/${encodeURIComponent(tricky)}/envio`,
      );
      // Garantía: el path crudo contiene los chars escapados.
      expect(req.request.url).toContain(encodeURIComponent(tricky));
      req.flush({
        status: 'enviado',
        clientSubmittedAt: REQ_TS,
        serverReceivedAt: SRV_TS,
      });
      await pending;
    });
  });

  describe('200 OK → éxito', () => {
    it('mapea body completo a EnvioResult con status enviado y timestamps', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush({
        status: 'enviado',
        clientSubmittedAt: REQ_TS,
        serverReceivedAt: SRV_TS,
      });

      const result = await pending;
      expect(result.status).toBe('enviado');
      expect(result.clientSubmittedAt).toBe(REQ_TS);
      expect(result.serverReceivedAt).toBe(SRV_TS);
    });
  });

  describe('409 → éxito (idempotencia)', () => {
    it('409 con body completo → colapsa a éxito reusando body', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush(
        {
          status: 'enviado',
          clientSubmittedAt: REQ_TS,
          serverReceivedAt: SRV_TS,
        },
        { status: 409, statusText: 'Conflict' },
      );

      const result = await pending;
      expect(result.status).toBe('enviado');
      expect(result.clientSubmittedAt).toBe(REQ_TS);
      expect(result.serverReceivedAt).toBe(SRV_TS);
    });

    it('409 con body vacío {} → usa clientSubmittedAt del request y serverReceivedAt = ""', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush({}, { status: 409, statusText: 'Conflict' });

      const result = await pending;
      expect(result.status).toBe('enviado');
      expect(result.clientSubmittedAt).toBe(REQ_TS);
      expect(result.serverReceivedAt).toBe('');
    });
  });

  describe('400 → InvalidSubmissionTime / InvalidPayload por code', () => {
    it('400 + code:"INVALID_TIME" → InvalidSubmissionTimeError', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush(
        { code: 'INVALID_TIME', message: 'cualquier-string-que-puede-cambiar' },
        { status: 400, statusText: 'Bad Request' },
      );
      await expect(pending).rejects.toBeInstanceOf(InvalidSubmissionTimeError);
    });

    it('400 + code:"INVALID_SHAPE" → InvalidPayloadError', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush(
        { code: 'INVALID_SHAPE', message: 'otro-string-variable' },
        { status: 400, statusText: 'Bad Request' },
      );
      await expect(pending).rejects.toBeInstanceOf(InvalidPayloadError);
    });

    it('400 sin code → InvalidPayloadError (fallback de 400)', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush({ message: 'mensaje-sin-code' }, { status: 400, statusText: 'Bad Request' });
      await expect(pending).rejects.toBeInstanceOf(InvalidPayloadError);
    });
  });

  describe('403 → SimulacroCerrado por code, sino NetworkError', () => {
    it('403 + code:"CLOSED" → SimulacroCerradoError', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush(
        { code: 'CLOSED', message: 'lo-que-sea' },
        { status: 403, statusText: 'Forbidden' },
      );
      await expect(pending).rejects.toBeInstanceOf(SimulacroCerradoError);
    });

    it('403 sin code → NetworkError (catch-all del classifier)', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush({ message: 'sin-code' }, { status: 403, statusText: 'Forbidden' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe('404 → SimulacroNoAsignado', () => {
    it('404 → SimulacroNoAsignadoError ignorando body', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush({ message: 'cualquier-string' }, { status: 404, statusText: 'Not Found' });
      await expect(pending).rejects.toBeInstanceOf(SimulacroNoAsignadoError);
    });
  });

  describe('401 → SessionExpired', () => {
    it('401 → SessionExpiredError ignorando body', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toBeInstanceOf(SessionExpiredError);
    });
  });

  describe('5xx y network failure → NetworkError', () => {
    it('500 → NetworkError', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('503 → NetworkError', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('status 0 (fallo de transporte) → NetworkError', async () => {
      const pending = adapter.enviar(defaultReq);
      const req = httpMock.expectOne(url(SIM_ID));
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network failure' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });
});
