import { describe, it, expect, beforeEach } from 'vitest';
import { ObtenerSimulacrosDelDiaUseCase } from '../../../src/L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { Simulacro } from '../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../src/L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../../src/L1_domain/value-objects/server-time';
import { NetworkError } from '../../../src/L1_domain/errors/network.error';
import { SessionExpiredError } from '../../../src/L1_domain/errors/session-expired.error';
import { FakeClock, FakeSimulacrosApi } from './fakes';

describe('ObtenerSimulacrosDelDiaUseCase', () => {
  let api: FakeSimulacrosApi;
  let clock: FakeClock;
  let useCase: ObtenerSimulacrosDelDiaUseCase;

  const buildSimulacro = (id: string, estadoValue: 'pendiente' | 'abierto') =>
    new Simulacro({
      id,
      area: 'Matemática',
      name: `Simulacro ${id}`,
      count: 20,
      inicio: new Date('2026-06-11T10:00:00Z'),
      fin: new Date('2026-06-11T12:00:00Z'),
      estado: new EstadoSimulacro(estadoValue),
    });

  beforeEach(() => {
    api = new FakeSimulacrosApi();
    clock = new FakeClock();
    useCase = new ObtenerSimulacrosDelDiaUseCase(api, clock);
  });

  describe('happy path', () => {
    it('devuelve la lista de simulacros tal cual la entrega el puerto', async () => {
      const simulacros = [buildSimulacro('sim-1', 'abierto'), buildSimulacro('sim-2', 'pendiente')];
      const serverTime = new ServerTime('2026-06-11T11:30:00Z');
      api.willResolveObtenerDelDia({ simulacros, serverTime });

      const result = await useCase.execute();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(simulacros[0]);
      expect(result[1]).toBe(simulacros[1]);
    });

    it('ancla el Clock con el ServerTime exacto reportado por el puerto', async () => {
      const simulacros = [buildSimulacro('sim-1', 'abierto')];
      const serverTime = new ServerTime('2026-06-11T11:30:00Z');
      api.willResolveObtenerDelDia({ simulacros, serverTime });

      await useCase.execute();

      const calls = clock.getSetServerTimeCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe(serverTime);
      expect(calls[0].toMillis()).toBe(new Date('2026-06-11T11:30:00Z').getTime());
    });

    it('invoca el puerto exactamente una vez por ejecución', async () => {
      api.willResolveObtenerDelDia({
        simulacros: [],
        serverTime: new ServerTime('2026-06-11T11:30:00Z'),
      });
      await useCase.execute();
      expect(api.getObtenerCalls()).toBe(1);
    });
  });

  describe('lista vacía', () => {
    it('devuelve array vacío cuando el backend no reporta simulacros', async () => {
      const serverTime = new ServerTime('2026-06-11T08:00:00Z');
      api.willResolveObtenerDelDia({ simulacros: [], serverTime });

      const result = await useCase.execute();

      expect(result).toEqual([]);
    });

    it('ancla el Clock incluso si la lista está vacía', async () => {
      const serverTime = new ServerTime('2026-06-11T08:00:00Z');
      api.willResolveObtenerDelDia({ simulacros: [], serverTime });

      await useCase.execute();

      expect(clock.getSetServerTimeCalls()).toHaveLength(1);
      expect(clock.getSetServerTimeCalls()[0]).toBe(serverTime);
    });
  });

  describe('propagación de errores', () => {
    it('propaga NetworkError sin capturarlo', async () => {
      api.willRejectObtenerDelDia(new NetworkError());
      await expect(useCase.execute()).rejects.toBeInstanceOf(NetworkError);
    });

    it('NO ancla el Clock si el puerto rechaza con NetworkError', async () => {
      api.willRejectObtenerDelDia(new NetworkError());
      await useCase.execute().catch(() => undefined);
      expect(clock.getSetServerTimeCalls()).toHaveLength(0);
    });

    it('propaga SessionExpiredError sin capturarlo', async () => {
      api.willRejectObtenerDelDia(new SessionExpiredError());
      await expect(useCase.execute()).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('NO ancla el Clock si el puerto rechaza con SessionExpiredError', async () => {
      api.willRejectObtenerDelDia(new SessionExpiredError());
      await useCase.execute().catch(() => undefined);
      expect(clock.getSetServerTimeCalls()).toHaveLength(0);
    });
  });
});
