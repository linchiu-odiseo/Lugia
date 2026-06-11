import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServerAnchoredClock } from '../../src/L3_periphery/clock/server-anchored-clock';
import { ServerTime } from '../../src/L1_domain/value-objects/server-time';

// ServerAnchoredClock es testeable como clase TS pura aunque viva en L3:
// no usa DI runtime ni APIs del browser, solo Date.now(). Por eso vive en
// tests/unit/ y no en tests/feature/ con TestBed.
describe('ServerAnchoredClock', () => {
  // Anchor local fijo para que los assertions sean exactos al ms.
  // (Equivalente a 2026-06-12T13:15:00Z.)
  const LOCAL_NOW = new Date('2026-06-12T13:15:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LOCAL_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sin offset previo (recién construido)', () => {
    it('clock.now() devuelve exactamente el reloj local actual', () => {
      const clock = new ServerAnchoredClock();
      const result = clock.now();

      // Sin offset el comportamiento es idéntico a new Date(Date.now()).
      expect(result.getTime()).toBe(LOCAL_NOW.getTime());
    });

    it('clock.now() está a menos de 5ms del Date.now() actual', () => {
      // Cubre el escenario de la spec con tolerancia, aunque con fake timers
      // la diferencia es exactamente 0.
      const clock = new ServerAnchoredClock();
      const before = Date.now();
      const result = clock.now().getTime();
      const after = Date.now();

      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after + 5);
    });
  });

  describe('setServerTime() con offset positivo', () => {
    it('después de setServerTime con +5s, clock.now() devuelve +5s respecto al reloj local', () => {
      const clock = new ServerAnchoredClock();
      const serverAhead = new ServerTime(
        new Date(LOCAL_NOW.getTime() + 5_000).toISOString(),
      );

      clock.setServerTime(serverAhead);

      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() + 5_000);
    });
  });

  describe('setServerTime() con offset negativo', () => {
    it('después de setServerTime con -3s, clock.now() devuelve -3s respecto al reloj local', () => {
      const clock = new ServerAnchoredClock();
      const serverBehind = new ServerTime(
        new Date(LOCAL_NOW.getTime() - 3_000).toISOString(),
      );

      clock.setServerTime(serverBehind);

      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() - 3_000);
    });
  });

  describe('reemplazo de offset en sucesivas llamadas', () => {
    it('una segunda llamada a setServerTime reemplaza (no acumula) el offset', () => {
      const clock = new ServerAnchoredClock();

      // Primer GET: server adelantado +10s.
      const firstServer = new ServerTime(
        new Date(LOCAL_NOW.getTime() + 10_000).toISOString(),
      );
      clock.setServerTime(firstServer);
      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() + 10_000);

      // Segundo GET (mismo instante local, drift distinto): server +2s.
      // Si acumulara sería +12s; el comportamiento correcto es reemplazar a +2s.
      const secondServer = new ServerTime(
        new Date(LOCAL_NOW.getTime() + 2_000).toISOString(),
      );
      clock.setServerTime(secondServer);
      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() + 2_000);
    });

    it('un GET con offset positivo seguido de uno con offset negativo invierte el signo, no suma', () => {
      const clock = new ServerAnchoredClock();

      clock.setServerTime(
        new ServerTime(new Date(LOCAL_NOW.getTime() + 5_000).toISOString()),
      );
      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() + 5_000);

      clock.setServerTime(
        new ServerTime(new Date(LOCAL_NOW.getTime() - 3_000).toISOString()),
      );
      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() - 3_000);
    });
  });

  describe('estabilidad del offset entre lecturas', () => {
    it('múltiples llamadas a now() sin avance de reloj devuelven el mismo timestamp', () => {
      const clock = new ServerAnchoredClock();
      clock.setServerTime(
        new ServerTime(new Date(LOCAL_NOW.getTime() + 7_000).toISOString()),
      );

      const a = clock.now().getTime();
      const b = clock.now().getTime();
      expect(a).toBe(b);
    });

    it('si el reloj local avanza 1s después de setServerTime, now() avanza 1s manteniendo el offset', () => {
      const clock = new ServerAnchoredClock();
      clock.setServerTime(
        new ServerTime(new Date(LOCAL_NOW.getTime() + 5_000).toISOString()),
      );

      // T0: server +5s.
      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() + 5_000);

      // Avanzamos el reloj local 1 segundo; el offset persiste, así que el
      // tiempo "servidor" también avanza 1 segundo.
      vi.setSystemTime(new Date(LOCAL_NOW.getTime() + 1_000));
      expect(clock.now().getTime()).toBe(LOCAL_NOW.getTime() + 1_000 + 5_000);
    });
  });
});
