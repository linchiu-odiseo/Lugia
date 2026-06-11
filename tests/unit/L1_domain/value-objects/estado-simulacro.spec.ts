import { describe, it, expect } from 'vitest';
import { EstadoSimulacro } from '../../../../src/L1_domain/value-objects/estado-simulacro';
import { InvalidSimulacroError } from '../../../../src/L1_domain/errors/invalid-simulacro.error';

describe('EstadoSimulacro', () => {
  describe('construcción válida', () => {
    it('admite "pendiente"', () => {
      const e = new EstadoSimulacro('pendiente');
      expect(e.value).toBe('pendiente');
    });

    it('admite "abierto"', () => {
      const e = new EstadoSimulacro('abierto');
      expect(e.value).toBe('abierto');
    });

    it('admite "enviado"', () => {
      const e = new EstadoSimulacro('enviado');
      expect(e.value).toBe('enviado');
    });

    it('admite "cerrado"', () => {
      const e = new EstadoSimulacro('cerrado');
      expect(e.value).toBe('cerrado');
    });
  });

  describe('rechazo de valores inválidos', () => {
    it('rechaza "atrasable" (estado anterior eliminado del modelo) con InvalidSimulacroError', () => {
      expect(() => new EstadoSimulacro('atrasable')).toThrow(InvalidSimulacroError);
    });

    it('rechaza string arbitrario con InvalidSimulacroError', () => {
      expect(() => new EstadoSimulacro('foo')).toThrow(InvalidSimulacroError);
    });

    it('rechaza string vacío con InvalidSimulacroError', () => {
      expect(() => new EstadoSimulacro('')).toThrow(InvalidSimulacroError);
    });

    it('rechaza variante mayúscula "ABIERTO" — case-sensitive', () => {
      expect(() => new EstadoSimulacro('ABIERTO')).toThrow(InvalidSimulacroError);
    });

    it('rechaza string con whitespace alrededor (sin trim implícito)', () => {
      // El backend manda los 4 strings sin whitespace; cualquier cosa con
      // espacios es bug y se rechaza explícitamente.
      expect(() => new EstadoSimulacro(' abierto')).toThrow(InvalidSimulacroError);
      expect(() => new EstadoSimulacro('abierto ')).toThrow(InvalidSimulacroError);
    });
  });

  describe('is()', () => {
    it('devuelve true cuando coincide con el valor recibido', () => {
      const e = new EstadoSimulacro('abierto');
      expect(e.is('abierto')).toBe(true);
    });

    it('devuelve false cuando no coincide', () => {
      const e = new EstadoSimulacro('abierto');
      expect(e.is('pendiente')).toBe(false);
      expect(e.is('enviado')).toBe(false);
      expect(e.is('cerrado')).toBe(false);
    });
  });

  describe('esTerminal()', () => {
    it('devuelve true para "enviado"', () => {
      expect(new EstadoSimulacro('enviado').esTerminal()).toBe(true);
    });

    it('devuelve true para "cerrado"', () => {
      expect(new EstadoSimulacro('cerrado').esTerminal()).toBe(true);
    });

    it('devuelve false para "pendiente"', () => {
      expect(new EstadoSimulacro('pendiente').esTerminal()).toBe(false);
    });

    it('devuelve false para "abierto"', () => {
      expect(new EstadoSimulacro('abierto').esTerminal()).toBe(false);
    });
  });

  describe('permiteEntrada()', () => {
    it('devuelve true SOLO para "abierto"', () => {
      expect(new EstadoSimulacro('abierto').permiteEntrada()).toBe(true);
    });

    it('devuelve false para "pendiente"', () => {
      expect(new EstadoSimulacro('pendiente').permiteEntrada()).toBe(false);
    });

    it('devuelve false para "enviado"', () => {
      expect(new EstadoSimulacro('enviado').permiteEntrada()).toBe(false);
    });

    it('devuelve false para "cerrado"', () => {
      expect(new EstadoSimulacro('cerrado').permiteEntrada()).toBe(false);
    });
  });
});
