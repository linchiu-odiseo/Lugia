import { describe, it, expect } from 'vitest';
import { Alternativa } from '../../../../src/L1_domain/value-objects/alternativa';
import { InvalidAlternativaError } from '../../../../src/L1_domain/errors/invalid-alternativa.error';

describe('Alternativa', () => {
  describe('fromString — letras válidas A–E', () => {
    it.each(['A', 'B', 'C', 'D', 'E'] as const)(
      'admite "%s" → value coincide e isMarked() === true',
      (letra) => {
        const a = Alternativa.fromString(letra);
        expect(a.value).toBe(letra);
        expect(a.isMarked()).toBe(true);
      },
    );
  });

  describe('fromString — null / undefined → desmarcado', () => {
    it('fromString(null) → value === null e isMarked() === false', () => {
      const a = Alternativa.fromString(null);
      expect(a.value).toBeNull();
      expect(a.isMarked()).toBe(false);
    });

    it('fromString(undefined) → value === null e isMarked() === false', () => {
      const a = Alternativa.fromString(undefined);
      expect(a.value).toBeNull();
      expect(a.isMarked()).toBe(false);
    });
  });

  describe('desmarcada() — factory para limpiar marca', () => {
    it('devuelve un value-object con value === null e isMarked() === false', () => {
      const a = Alternativa.desmarcada();
      expect(a.value).toBeNull();
      expect(a.isMarked()).toBe(false);
    });
  });

  describe('fromString — rechazo de valores inválidos', () => {
    it('rechaza "F" (letra fuera de A–E) con InvalidAlternativaError', () => {
      expect(() => Alternativa.fromString('F')).toThrow(InvalidAlternativaError);
    });

    it('rechaza string vacío con InvalidAlternativaError', () => {
      expect(() => Alternativa.fromString('')).toThrow(InvalidAlternativaError);
    });

    it('rechaza minúscula "a" (case-sensitive) con InvalidAlternativaError', () => {
      expect(() => Alternativa.fromString('a')).toThrow(InvalidAlternativaError);
    });

    it('rechaza "AA" (multi-char) con InvalidAlternativaError', () => {
      expect(() => Alternativa.fromString('AA')).toThrow(InvalidAlternativaError);
    });

    it('rechaza string con whitespace alrededor de letra válida', () => {
      expect(() => Alternativa.fromString(' A')).toThrow(InvalidAlternativaError);
      expect(() => Alternativa.fromString('A ')).toThrow(InvalidAlternativaError);
    });

    it('rechaza dígito numérico', () => {
      expect(() => Alternativa.fromString('1')).toThrow(InvalidAlternativaError);
    });
  });

  describe('equals — compara por value', () => {
    it('dos alternativas con la misma letra → true', () => {
      const a = Alternativa.fromString('C');
      const b = Alternativa.fromString('C');
      expect(a.equals(b)).toBe(true);
    });

    it('dos alternativas con letras distintas → false', () => {
      const a = Alternativa.fromString('A');
      const b = Alternativa.fromString('B');
      expect(a.equals(b)).toBe(false);
    });

    it('dos desmarcadas (null === null) → true', () => {
      const a = Alternativa.desmarcada();
      const b = Alternativa.fromString(null);
      expect(a.equals(b)).toBe(true);
    });

    it('marcada vs desmarcada → false', () => {
      const a = Alternativa.fromString('C');
      const b = Alternativa.desmarcada();
      expect(a.equals(b)).toBe(false);
    });

    it('es reflexiva — equals con sí misma → true', () => {
      const a = Alternativa.fromString('D');
      expect(a.equals(a)).toBe(true);
    });
  });
});
