import { describe, it, expect } from 'vitest';
import { ServerTime } from '../../src/L1_domain/value-objects/server-time';
import { InvalidServerTimeError } from '../../src/L1_domain/errors/invalid-server-time.error';

describe('ServerTime', () => {
  describe('construcción válida', () => {
    it('acepta ISO8601 con timezone offset y resuelve a un Date equivalente', () => {
      const raw = '2026-06-12T08:15:00-05:00';
      const st = new ServerTime(raw);

      expect(st.value).toBeInstanceOf(Date);
      // Mismo instante en el tiempo: 08:15-05:00 === 13:15Z.
      expect(st.value.toISOString()).toBe('2026-06-12T13:15:00.000Z');
    });

    it('acepta ISO8601 en UTC zulú', () => {
      const raw = '2026-06-12T13:15:00Z';
      const st = new ServerTime(raw);

      expect(st.value).toBeInstanceOf(Date);
      expect(st.value.toISOString()).toBe('2026-06-12T13:15:00.000Z');
    });

    it('trata ambos formatos (offset vs zulú) que representan el mismo instante como iguales', () => {
      const withOffset = new ServerTime('2026-06-12T08:15:00-05:00');
      const withZulu = new ServerTime('2026-06-12T13:15:00Z');

      expect(withOffset.toMillis()).toBe(withZulu.toMillis());
    });
  });

  describe('toMillis()', () => {
    it('devuelve exactamente value.getTime()', () => {
      const st = new ServerTime('2026-06-12T13:15:00Z');
      expect(st.toMillis()).toBe(st.value.getTime());
    });

    it('devuelve el epoch en ms correcto para un instante UTC conocido', () => {
      // 2026-06-12T13:15:00Z === Date.UTC(2026, 5, 12, 13, 15, 0).
      const expected = Date.UTC(2026, 5, 12, 13, 15, 0);
      const st = new ServerTime('2026-06-12T13:15:00Z');
      expect(st.toMillis()).toBe(expected);
    });
  });

  describe('rechazo con InvalidServerTimeError', () => {
    it('rechaza string vacío', () => {
      expect(() => new ServerTime('')).toThrow(InvalidServerTimeError);
    });

    it('rechaza solo whitespace', () => {
      expect(() => new ServerTime('   ')).toThrow(InvalidServerTimeError);
      expect(() => new ServerTime('\t\n ')).toThrow(InvalidServerTimeError);
    });

    it('rechaza string no-parseable como "hola"', () => {
      expect(() => new ServerTime('hola')).toThrow(InvalidServerTimeError);
    });

    it('el error lanzado tiene name === "InvalidServerTimeError"', () => {
      try {
        new ServerTime('no-es-fecha');
        // Si llegamos aquí, el test debe fallar.
        expect.fail('Se esperaba que ServerTime lanzara InvalidServerTimeError');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidServerTimeError);
        expect((e as Error).name).toBe('InvalidServerTimeError');
      }
    });
  });
});
