import { describe, it, expect } from 'vitest';
import { Simulacro } from '../../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../../src/L1_domain/value-objects/estado-simulacro';
import { InvalidSimulacroError } from '../../../../src/L1_domain/errors/invalid-simulacro.error';

describe('Simulacro', () => {
  const validEstado = new EstadoSimulacro('pendiente');
  const validInicio = new Date('2026-06-11T10:00:00Z');
  const validFin = new Date('2026-06-11T12:00:00Z');

  const validParams = {
    id: 'sim-001',
    area: 'Matemática',
    name: 'Simulacro 1 — Aritmética',
    count: 20,
    inicio: validInicio,
    fin: validFin,
    estado: validEstado,
  } as const;

  describe('construcción válida', () => {
    it('expone todos los campos cuando los args son válidos', () => {
      const s = new Simulacro({ ...validParams });
      expect(s.id).toBe('sim-001');
      expect(s.area).toBe('Matemática');
      expect(s.name).toBe('Simulacro 1 — Aritmética');
      expect(s.count).toBe(20);
      expect(s.inicio).toEqual(validInicio);
      expect(s.fin).toEqual(validFin);
      expect(s.estado).toBe(validEstado);
    });

    it('trimea id, area y name', () => {
      const s = new Simulacro({
        ...validParams,
        id: '  sim-001  ',
        area: '  Matemática  ',
        name: '  Simulacro 1  ',
      });
      expect(s.id).toBe('sim-001');
      expect(s.area).toBe('Matemática');
      expect(s.name).toBe('Simulacro 1');
    });

    it('admite count = 1 (mínimo entero positivo)', () => {
      const s = new Simulacro({ ...validParams, count: 1 });
      expect(s.count).toBe(1);
    });

    it('admite cualquiera de los 4 estados', () => {
      for (const value of ['pendiente', 'abierto', 'enviado', 'cerrado'] as const) {
        const s = new Simulacro({ ...validParams, estado: new EstadoSimulacro(value) });
        expect(s.estado.value).toBe(value);
      }
    });
  });

  describe('invariantes — id', () => {
    it('rechaza id vacío con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, id: '' })).toThrow(InvalidSimulacroError);
    });

    it('rechaza id solo whitespace con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, id: '   ' })).toThrow(InvalidSimulacroError);
    });

    it('rechaza id null-equivalent con InvalidSimulacroError', () => {
      expect(
        () => new Simulacro({ ...validParams, id: null as unknown as string }),
      ).toThrow(InvalidSimulacroError);
    });
  });

  describe('invariantes — area', () => {
    it('rechaza area vacía con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, area: '' })).toThrow(InvalidSimulacroError);
    });

    it('rechaza area solo whitespace con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, area: '   ' })).toThrow(
        InvalidSimulacroError,
      );
    });
  });

  describe('invariantes — name', () => {
    it('rechaza name vacío con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, name: '' })).toThrow(InvalidSimulacroError);
    });

    it('rechaza name solo whitespace con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, name: '   ' })).toThrow(
        InvalidSimulacroError,
      );
    });
  });

  describe('invariantes — count', () => {
    it('rechaza count = 0 con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, count: 0 })).toThrow(InvalidSimulacroError);
    });

    it('rechaza count negativo con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, count: -1 })).toThrow(InvalidSimulacroError);
    });

    it('rechaza count no-entero (1.5) con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, count: 1.5 })).toThrow(
        InvalidSimulacroError,
      );
    });

    it('rechaza count no-numérico con InvalidSimulacroError', () => {
      expect(
        () => new Simulacro({ ...validParams, count: 'veinte' as unknown as number }),
      ).toThrow(InvalidSimulacroError);
    });

    it('rechaza count NaN con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, count: Number.NaN })).toThrow(
        InvalidSimulacroError,
      );
    });
  });

  describe('invariantes — inicio/fin', () => {
    it('rechaza inicio no-Date con InvalidSimulacroError', () => {
      expect(
        () =>
          new Simulacro({
            ...validParams,
            inicio: '2026-06-11T10:00:00Z' as unknown as Date,
          }),
      ).toThrow(InvalidSimulacroError);
    });

    it('rechaza inicio Date inválida (NaN time) con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, inicio: new Date('not-a-date') })).toThrow(
        InvalidSimulacroError,
      );
    });

    it('rechaza fin no-Date con InvalidSimulacroError', () => {
      expect(
        () =>
          new Simulacro({
            ...validParams,
            fin: '2026-06-11T12:00:00Z' as unknown as Date,
          }),
      ).toThrow(InvalidSimulacroError);
    });

    it('rechaza fin Date inválida (NaN time) con InvalidSimulacroError', () => {
      expect(() => new Simulacro({ ...validParams, fin: new Date('not-a-date') })).toThrow(
        InvalidSimulacroError,
      );
    });

    it('rechaza fin === inicio (ventana degenerada) con InvalidSimulacroError', () => {
      expect(
        () => new Simulacro({ ...validParams, inicio: validInicio, fin: new Date(validInicio) }),
      ).toThrow(InvalidSimulacroError);
    });

    it('rechaza fin < inicio con InvalidSimulacroError', () => {
      expect(
        () =>
          new Simulacro({
            ...validParams,
            inicio: validFin,
            fin: validInicio,
          }),
      ).toThrow(InvalidSimulacroError);
    });
  });

  describe('invariantes — estado', () => {
    it('rechaza estado no-EstadoSimulacro (string crudo) con InvalidSimulacroError', () => {
      expect(
        () =>
          new Simulacro({
            ...validParams,
            estado: 'abierto' as unknown as EstadoSimulacro,
          }),
      ).toThrow(InvalidSimulacroError);
    });

    it('rechaza estado null con InvalidSimulacroError', () => {
      expect(
        () =>
          new Simulacro({
            ...validParams,
            estado: null as unknown as EstadoSimulacro,
          }),
      ).toThrow(InvalidSimulacroError);
    });
  });
});
