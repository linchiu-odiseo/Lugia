import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetomarEnviosPendientesUseCase } from '../../../src/L2_application/use-cases/retomar-envios-pendientes.use-case';
import { NetworkError } from '../../../src/L1_domain/errors/network.error';
import { SimulacroCerradoError } from '../../../src/L1_domain/errors/simulacro-cerrado.error';
import { SimulacroNoAsignadoError } from '../../../src/L1_domain/errors/simulacro-no-asignado.error';
import { InvalidSubmissionTimeError } from '../../../src/L1_domain/errors/invalid-submission-time.error';
import { InvalidPayloadError } from '../../../src/L1_domain/errors/invalid-payload.error';
import { FakeSimulacrosApi, InMemoryMarkingsStorage } from './fakes';

// Cubre `RetomarEnviosPendientesUseCase` (L2) según spec sec.9 Req 2:
// retry automático de envíos encolados cuando vuelve la red.
describe('RetomarEnviosPendientesUseCase', () => {
  let api: FakeSimulacrosApi;
  let storage: InMemoryMarkingsStorage;
  let useCase: RetomarEnviosPendientesUseCase;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  // Resultado de éxito por defecto (lo que el adapter HTTP devuelve tras 200/409).
  const okResult = (clientSubmittedAt: string) => ({
    status: 'enviado' as const,
    clientSubmittedAt,
    serverReceivedAt: '2026-06-11T09:00:01.000Z',
  });

  beforeEach(() => {
    api = new FakeSimulacrosApi();
    storage = new InMemoryMarkingsStorage();
    useCase = new RetomarEnviosPendientesUseCase(api, storage);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('cola vacía', () => {
    it('no invoca api.enviar cuando la cola está vacía', async () => {
      await useCase.execute();

      expect(api.getEnviarCalls()).toHaveLength(0);
      expect(storage.getOpsLog()).not.toContain('markings.dequeueEnvio');
      expect(storage.getOpsLog()).not.toContain('markings.clearMarcaciones');
    });
  });

  describe('1 envío en cola — éxito', () => {
    it('despacha con el envío exacto (preservando clientSubmittedAt original)', async () => {
      storage.seedMarcacion('sim-1', 1, 'A');
      storage.seedEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T08:55:00.000Z',
      });
      api.willResolveEnviar(okResult('2026-06-11T08:55:00.000Z'));

      await useCase.execute();

      const calls = api.getEnviarCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T08:55:00.000Z',
      });
    });

    it('dequeue + clearMarcaciones tras éxito', async () => {
      storage.seedMarcacion('sim-1', 1, 'A');
      storage.seedEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T08:55:00.000Z',
      });
      api.willResolveEnviar(okResult('2026-06-11T08:55:00.000Z'));

      await useCase.execute();

      expect(await storage.getEnviosPendientes()).toEqual([]);
      expect(await storage.getMarcaciones('sim-1')).toEqual({});
      expect(storage.getOpsLog()).toContain('markings.dequeueEnvio');
      expect(storage.getOpsLog()).toContain('markings.clearMarcaciones');
    });
  });

  describe('3 envíos en cola — todos éxito', () => {
    it('procesa los 3 en orden, dequeue + clearMarcaciones por cada uno', async () => {
      const ts = (suffix: string) => `2026-06-11T08:${suffix}.000Z`;
      storage.seedEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: ts('50:00'),
      });
      storage.seedEnvio({
        simulacroId: 'sim-2',
        answers: { '1': 'B' },
        clientSubmittedAt: ts('52:00'),
      });
      storage.seedEnvio({
        simulacroId: 'sim-3',
        answers: { '1': 'C' },
        clientSubmittedAt: ts('54:00'),
      });
      api.willEnviarInSequence([
        { kind: 'resolve', result: okResult(ts('50:00')) },
        { kind: 'resolve', result: okResult(ts('52:00')) },
        { kind: 'resolve', result: okResult(ts('54:00')) },
      ]);

      await useCase.execute();

      expect(api.getEnviarCalls()).toHaveLength(3);
      expect(await storage.getEnviosPendientes()).toEqual([]);
      const log = storage.getOpsLog();
      expect(log.filter((op) => op === 'markings.dequeueEnvio')).toHaveLength(3);
      expect(log.filter((op) => op === 'markings.clearMarcaciones')).toHaveLength(3);
    });
  });

  describe('NetworkError durante el despacho', () => {
    it('deja en cola (NO dequeue ni clearMarcaciones) para retry futuro', async () => {
      storage.seedMarcacion('sim-1', 1, 'A');
      storage.seedEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T08:55:00.000Z',
      });
      api.willRejectEnviar(new NetworkError());

      await useCase.execute();

      // La cola sigue intacta.
      expect(await storage.getEnviosPendientes()).toHaveLength(1);
      // Las marcaciones tampoco se borraron.
      expect(await storage.getMarcaciones('sim-1')).toEqual({ '1': 'A' });
      expect(storage.getOpsLog()).not.toContain('markings.dequeueEnvio');
      expect(storage.getOpsLog()).not.toContain('markings.clearMarcaciones');
    });
  });

  describe('4xx no recuperables → descarta + warn', () => {
    const NO_RECUPERABLES: readonly [string, () => Error][] = [
      ['SimulacroCerradoError', () => new SimulacroCerradoError()],
      ['SimulacroNoAsignadoError', () => new SimulacroNoAsignadoError()],
      ['InvalidSubmissionTimeError', () => new InvalidSubmissionTimeError()],
      ['InvalidPayloadError', () => new InvalidPayloadError()],
    ];

    it.each(NO_RECUPERABLES)(
      '%s → dequeue + clearMarcaciones + console.warn',
      async (_name, build) => {
        storage.seedMarcacion('sim-1', 1, 'A');
        storage.seedEnvio({
          simulacroId: 'sim-1',
          answers: { '1': 'A' },
          clientSubmittedAt: '2026-06-11T08:55:00.000Z',
        });
        api.willRejectEnviar(build());

        await useCase.execute();

        expect(await storage.getEnviosPendientes()).toEqual([]);
        expect(await storage.getMarcaciones('sim-1')).toEqual({});
        expect(storage.getOpsLog()).toContain('markings.dequeueEnvio');
        expect(storage.getOpsLog()).toContain('markings.clearMarcaciones');
        expect(warnSpy).toHaveBeenCalled();
      },
    );
  });

  describe('mix de resultados', () => {
    it('NetworkError en el primer envío + éxito en el segundo → solo el segundo se dequeue', async () => {
      storage.seedMarcacion('sim-1', 1, 'A');
      storage.seedMarcacion('sim-2', 1, 'B');
      storage.seedEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T08:55:00.000Z',
      });
      storage.seedEnvio({
        simulacroId: 'sim-2',
        answers: { '1': 'B' },
        clientSubmittedAt: '2026-06-11T08:56:00.000Z',
      });
      api.willEnviarInSequence([
        { kind: 'reject', error: new NetworkError() },
        { kind: 'resolve', result: okResult('2026-06-11T08:56:00.000Z') },
      ]);

      await useCase.execute();

      // sim-1 sigue en cola; sim-2 se procesó.
      const pendientes = await storage.getEnviosPendientes();
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0].simulacroId).toBe('sim-1');
      expect(await storage.getMarcaciones('sim-1')).toEqual({ '1': 'A' });
      expect(await storage.getMarcaciones('sim-2')).toEqual({});
    });
  });
});
