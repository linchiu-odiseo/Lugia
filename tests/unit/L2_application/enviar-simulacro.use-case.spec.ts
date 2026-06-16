import { describe, it, expect, beforeEach } from 'vitest';
import { EnviarSimulacroUseCase } from '../../../src/L2_application/use-cases/enviar-simulacro.use-case';
import { ServerTime } from '../../../src/L1_domain/value-objects/server-time';
import { NetworkError } from '../../../src/L1_domain/errors/network.error';
import { SessionExpiredError } from '../../../src/L1_domain/errors/session-expired.error';
import { SimulacroCerradoError } from '../../../src/L1_domain/errors/simulacro-cerrado.error';
import { SimulacroNoAsignadoError } from '../../../src/L1_domain/errors/simulacro-no-asignado.error';
import { InvalidSubmissionTimeError } from '../../../src/L1_domain/errors/invalid-submission-time.error';
import { InvalidPayloadError } from '../../../src/L1_domain/errors/invalid-payload.error';
import { SubmissionNotAvailableError } from '../../../src/L1_domain/errors/submission-not-available.error';
import { FakeClock, FakeExamsApi, InMemoryMarkingsStorage } from './fakes';

// Cubre `EnviarSimulacroUseCase` (L2): envío con `clientSubmittedAt`, queue
// offline (NetworkError) y propagación de errores no-recuperables — incluido
// `SubmissionNotAvailableError` que NUNCA se debe encolar (POST stub del
// change `fase-3-exam-list-learnex`).
describe('EnviarSimulacroUseCase', () => {
  let api: FakeExamsApi;
  let storage: InMemoryMarkingsStorage;
  let clock: FakeClock;
  let useCase: EnviarSimulacroUseCase;

  // ServerTime anclado para que clock.now() sea predecible en el test.
  const SERVER_NOW_ISO = '2026-06-11T08:47:05.000Z';

  beforeEach(() => {
    api = new FakeExamsApi();
    storage = new InMemoryMarkingsStorage();
    clock = new FakeClock();
    clock.setServerTime(new ServerTime(SERVER_NOW_ISO));
    useCase = new EnviarSimulacroUseCase(api, storage, clock);
  });

  describe('happy path', () => {
    it('POST incluye answers leídos del storage y clientSubmittedAt = clock.now().toISOString()', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      storage.seedMarcacion('exam-1', 2, 'C');
      api.willResolveEnviar({
        status: 'enviado',
        clientSubmittedAt: SERVER_NOW_ISO,
        serverReceivedAt: '2026-06-11T08:47:06.000Z',
      });

      const result = await useCase.execute({ examId: 'exam-1' });

      const calls = api.getEnviarCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].examId).toBe('exam-1');
      expect(calls[0].answers).toEqual({ '1': 'A', '2': 'C' });
      expect(calls[0].clientSubmittedAt).toBe(SERVER_NOW_ISO);
      expect(result.status).toBe('enviado');
      expect(result.clientSubmittedAt).toBe(SERVER_NOW_ISO);
    });

    it('tras éxito, las marcaciones del examen se borran del storage', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      storage.seedMarcacion('exam-1', 2, 'C');
      api.willResolveEnviar({
        status: 'enviado',
        clientSubmittedAt: SERVER_NOW_ISO,
        serverReceivedAt: '2026-06-11T08:47:06.000Z',
      });

      await useCase.execute({ examId: 'exam-1' });

      expect(await storage.getMarcaciones('exam-1')).toEqual({});
      expect(storage.getOpsLog()).toContain('markings.clearMarcaciones');
    });

    it('marcaciones de OTRO examen NO se borran tras éxito en exam-1', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      storage.seedMarcacion('exam-2', 1, 'B');
      api.willResolveEnviar({
        status: 'enviado',
        clientSubmittedAt: SERVER_NOW_ISO,
        serverReceivedAt: '2026-06-11T08:47:06.000Z',
      });

      await useCase.execute({ examId: 'exam-1' });

      expect(await storage.getMarcaciones('exam-2')).toEqual({ '1': 'B' });
    });

    it('empty answers (storage vacío) → POST con answers={} igual, success', async () => {
      api.willResolveEnviar({
        status: 'enviado',
        clientSubmittedAt: SERVER_NOW_ISO,
        serverReceivedAt: '2026-06-11T08:47:06.000Z',
      });

      const result = await useCase.execute({ examId: 'exam-1' });

      expect(api.getEnviarCalls()).toHaveLength(1);
      expect(api.getEnviarCalls()[0].answers).toEqual({});
      expect(result.status).toBe('enviado');
    });
  });

  describe('clientSubmittedAtOverride (auto-envío)', () => {
    it('cuando se pasa override, POST usa esa Date.toISOString() — NO clock.now()', async () => {
      const FIN_ISO = '2026-06-11T09:00:00.000Z';
      const fin = new Date(FIN_ISO);
      api.willResolveEnviar({
        status: 'enviado',
        clientSubmittedAt: FIN_ISO,
        serverReceivedAt: '2026-06-11T09:00:01.000Z',
      });

      const result = await useCase.execute({
        examId: 'exam-1',
        clientSubmittedAtOverride: fin,
      });

      const calls = api.getEnviarCalls();
      expect(calls).toHaveLength(1);
      // Crítico: clientSubmittedAt == fin del examen, NO clock.now()
      // (que estaría en SERVER_NOW_ISO 8:47:05).
      expect(calls[0].clientSubmittedAt).toBe(FIN_ISO);
      expect(calls[0].clientSubmittedAt).not.toBe(SERVER_NOW_ISO);
      expect(result.clientSubmittedAt).toBe(FIN_ISO);
    });
  });

  describe('NetworkError → encolado', () => {
    it('encola con el clientSubmittedAt original capturado al intento', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      storage.seedMarcacion('exam-1', 2, 'B');
      api.willRejectEnviar(new NetworkError());

      const result = await useCase.execute({ examId: 'exam-1' });

      expect(result.status).toBe('queued');
      expect(result.clientSubmittedAt).toBe(SERVER_NOW_ISO);

      const pendientes = await storage.getEnviosPendientes();
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0]).toEqual({
        examId: 'exam-1',
        answers: { '1': 'A', '2': 'B' },
        clientSubmittedAt: SERVER_NOW_ISO,
      });
      expect(storage.getOpsLog()).toContain('markings.enqueueEnvio');
    });

    it('NO borra las marcaciones del storage cuando queda en cola', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      api.willRejectEnviar(new NetworkError());

      await useCase.execute({ examId: 'exam-1' });

      expect(await storage.getMarcaciones('exam-1')).toEqual({ '1': 'A' });
      expect(storage.getOpsLog()).not.toContain('markings.clearMarcaciones');
    });

    it('con override, encola preservando el override como clientSubmittedAt', async () => {
      const FIN_ISO = '2026-06-11T09:00:00.000Z';
      storage.seedMarcacion('exam-1', 1, 'A');
      api.willRejectEnviar(new NetworkError());

      const result = await useCase.execute({
        examId: 'exam-1',
        clientSubmittedAtOverride: new Date(FIN_ISO),
      });

      expect(result.status).toBe('queued');
      expect(result.clientSubmittedAt).toBe(FIN_ISO);
      const pendientes = await storage.getEnviosPendientes();
      expect(pendientes[0].clientSubmittedAt).toBe(FIN_ISO);
    });
  });

  describe('SubmissionNotAvailableError (POST stub) propaga sin tocar storage', () => {
    // Test CRÍTICO del seam de Change 1: el POST stub L3 lanza
    // SubmissionNotAvailableError, que NO extiende NetworkError. El use case
    // debe propagar tal cual SIN encolar — un error en la herencia haría que
    // el outbox crezca con envíos imposibles de despachar.
    it('propaga SubmissionNotAvailableError tal cual y NO encola en outbox', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      storage.seedMarcacion('exam-1', 2, 'B');
      api.willRejectEnviar(new SubmissionNotAvailableError());

      await expect(useCase.execute({ examId: 'exam-1' })).rejects.toBeInstanceOf(
        SubmissionNotAvailableError,
      );

      // Outbox vacío: la guarda del catch funcionó.
      expect(await storage.getEnviosPendientes()).toEqual([]);
      expect(storage.getOpsLog()).not.toContain('markings.enqueueEnvio');
      // Y tampoco borró marcaciones (no hubo éxito).
      expect(await storage.getMarcaciones('exam-1')).toEqual({ '1': 'A', '2': 'B' });
      expect(storage.getOpsLog()).not.toContain('markings.clearMarcaciones');
    });
  });

  describe('errores de dominio propagados (no encolan, no borran)', () => {
    const ESCENARIOS: readonly [string, () => Error][] = [
      ['SimulacroCerradoError', () => new SimulacroCerradoError()],
      ['SimulacroNoAsignadoError', () => new SimulacroNoAsignadoError()],
      ['InvalidSubmissionTimeError', () => new InvalidSubmissionTimeError()],
      ['InvalidPayloadError', () => new InvalidPayloadError()],
      ['SessionExpiredError', () => new SessionExpiredError()],
    ];

    it.each(ESCENARIOS)('propaga %s sin tocar storage', async (_name, build) => {
      storage.seedMarcacion('exam-1', 1, 'A');
      const error = build();
      api.willRejectEnviar(error);

      await expect(useCase.execute({ examId: 'exam-1' })).rejects.toBe(error);

      // Marcaciones intactas.
      expect(await storage.getMarcaciones('exam-1')).toEqual({ '1': 'A' });
      // No se encoló.
      expect(await storage.getEnviosPendientes()).toEqual([]);
      // No se hizo clear ni enqueue (solo getMarcaciones está permitido en el path).
      expect(storage.getOpsLog()).not.toContain('markings.clearMarcaciones');
      expect(storage.getOpsLog()).not.toContain('markings.enqueueEnvio');
    });
  });
});
