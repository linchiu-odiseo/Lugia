import { describe, it, expect } from 'vitest';
import { Marcacion } from '../../../../src/L1_domain/entities/marcacion';
import { Alternativa } from '../../../../src/L1_domain/value-objects/alternativa';
import { InvalidMarcacionError } from '../../../../src/L1_domain/errors/invalid-marcacion.error';

describe('Marcacion', () => {
  const validAlternativa = Alternativa.fromString('C');
  const validUnmarked = Alternativa.desmarcada();

  describe('construcción válida', () => {
    it('expone los tres campos cuando args son válidos', () => {
      const m = new Marcacion('sim-001', 5, validAlternativa);
      expect(m.simulacroId).toBe('sim-001');
      expect(m.pregunta).toBe(5);
      expect(m.alternativa).toBe(validAlternativa);
      expect(m.alternativa.value).toBe('C');
    });

    it('trimea simulacroId', () => {
      const m = new Marcacion('  sim-001  ', 1, validAlternativa);
      expect(m.simulacroId).toBe('sim-001');
    });

    it('admite alternativa desmarcada (value === null)', () => {
      const m = new Marcacion('sim-001', 1, validUnmarked);
      expect(m.alternativa.value).toBeNull();
    });

    it('admite pregunta = 1 (mínimo entero positivo)', () => {
      const m = new Marcacion('sim-001', 1, validAlternativa);
      expect(m.pregunta).toBe(1);
    });
  });

  describe('invariantes — simulacroId', () => {
    it('rechaza simulacroId vacío con InvalidMarcacionError', () => {
      expect(() => new Marcacion('', 1, validAlternativa)).toThrow(InvalidMarcacionError);
    });

    it('rechaza simulacroId solo whitespace con InvalidMarcacionError', () => {
      expect(() => new Marcacion('   ', 1, validAlternativa)).toThrow(InvalidMarcacionError);
    });

    it('rechaza simulacroId null-equivalent sin crashear', () => {
      expect(
        () => new Marcacion(null as unknown as string, 1, validAlternativa),
      ).toThrow(InvalidMarcacionError);
      expect(
        () => new Marcacion(undefined as unknown as string, 1, validAlternativa),
      ).toThrow(InvalidMarcacionError);
    });
  });

  describe('invariantes — pregunta', () => {
    it('rechaza pregunta = 0 con InvalidMarcacionError', () => {
      expect(() => new Marcacion('sim-001', 0, validAlternativa)).toThrow(InvalidMarcacionError);
    });

    it('rechaza pregunta negativa con InvalidMarcacionError', () => {
      expect(() => new Marcacion('sim-001', -1, validAlternativa)).toThrow(InvalidMarcacionError);
    });

    it('rechaza pregunta no-entera (1.5) con InvalidMarcacionError', () => {
      expect(() => new Marcacion('sim-001', 1.5, validAlternativa)).toThrow(
        InvalidMarcacionError,
      );
    });

    it('rechaza pregunta NaN con InvalidMarcacionError', () => {
      expect(() => new Marcacion('sim-001', Number.NaN, validAlternativa)).toThrow(
        InvalidMarcacionError,
      );
    });

    it('rechaza pregunta no-numérica con InvalidMarcacionError', () => {
      expect(
        () => new Marcacion('sim-001', 'cinco' as unknown as number, validAlternativa),
      ).toThrow(InvalidMarcacionError);
    });
  });

  describe('invariantes — alternativa', () => {
    it('rechaza alternativa que no es instancia de Alternativa (string crudo)', () => {
      expect(
        () => new Marcacion('sim-001', 1, 'C' as unknown as Alternativa),
      ).toThrow(InvalidMarcacionError);
    });

    it('rechaza alternativa null con InvalidMarcacionError', () => {
      expect(
        () => new Marcacion('sim-001', 1, null as unknown as Alternativa),
      ).toThrow(InvalidMarcacionError);
    });

    it('rechaza alternativa undefined con InvalidMarcacionError', () => {
      expect(
        () => new Marcacion('sim-001', 1, undefined as unknown as Alternativa),
      ).toThrow(InvalidMarcacionError);
    });

    it('rechaza objeto que parece Alternativa pero no es instancia (duck-typing)', () => {
      const fakeAlt = { value: 'C', isMarked: () => true } as unknown as Alternativa;
      expect(() => new Marcacion('sim-001', 1, fakeAlt)).toThrow(InvalidMarcacionError);
    });
  });
});
