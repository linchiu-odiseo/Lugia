import { describe, it, expect } from 'vitest';
import { ExamServerStatus } from '../../../../src/L1_domain/value-objects/exam-server-status';
import { InvalidExamError } from '../../../../src/L1_domain/errors/invalid-exam.error';

describe('ExamServerStatus', () => {
  describe('construcción válida', () => {
    it('admite "scheduled"', () => {
      const s = new ExamServerStatus('scheduled');
      expect(s.value).toBe('scheduled');
    });

    it('admite "in_progress"', () => {
      const s = new ExamServerStatus('in_progress');
      expect(s.value).toBe('in_progress');
    });

    it('admite "finalized"', () => {
      const s = new ExamServerStatus('finalized');
      expect(s.value).toBe('finalized');
    });
  });

  describe('rechazo de valores inválidos', () => {
    it('rechaza el viejo "pendiente" (vocabulario Fase 2) con InvalidExamError', () => {
      expect(() => new ExamServerStatus('pendiente')).toThrow(InvalidExamError);
    });

    it('rechaza el viejo "abierto" con InvalidExamError', () => {
      expect(() => new ExamServerStatus('abierto')).toThrow(InvalidExamError);
    });

    it('rechaza el viejo "enviado" con InvalidExamError', () => {
      expect(() => new ExamServerStatus('enviado')).toThrow(InvalidExamError);
    });

    it('rechaza el viejo "cerrado" con InvalidExamError', () => {
      expect(() => new ExamServerStatus('cerrado')).toThrow(InvalidExamError);
    });

    it('rechaza string arbitrario con InvalidExamError', () => {
      expect(() => new ExamServerStatus('foo')).toThrow(InvalidExamError);
    });

    it('rechaza string vacío con InvalidExamError', () => {
      expect(() => new ExamServerStatus('')).toThrow(InvalidExamError);
    });

    it('rechaza variante mayúscula — case-sensitive', () => {
      expect(() => new ExamServerStatus('IN_PROGRESS')).toThrow(InvalidExamError);
      expect(() => new ExamServerStatus('Scheduled')).toThrow(InvalidExamError);
    });

    it('rechaza string con whitespace alrededor (sin trim implícito)', () => {
      // El backend manda los 3 valores literales; cualquier cosa con espacios
      // es bug y se rechaza explícitamente.
      expect(() => new ExamServerStatus(' in_progress')).toThrow(InvalidExamError);
      expect(() => new ExamServerStatus('finalized ')).toThrow(InvalidExamError);
    });
  });

  describe('is()', () => {
    it('devuelve true cuando coincide con el valor recibido', () => {
      const s = new ExamServerStatus('in_progress');
      expect(s.is('in_progress')).toBe(true);
    });

    it('devuelve false cuando no coincide', () => {
      const s = new ExamServerStatus('in_progress');
      expect(s.is('scheduled')).toBe(false);
      expect(s.is('finalized')).toBe(false);
    });
  });

  describe('esTerminal()', () => {
    it('devuelve true SOLO para "finalized"', () => {
      expect(new ExamServerStatus('finalized').esTerminal()).toBe(true);
    });

    it('devuelve false para "scheduled"', () => {
      expect(new ExamServerStatus('scheduled').esTerminal()).toBe(false);
    });

    it('devuelve false para "in_progress"', () => {
      expect(new ExamServerStatus('in_progress').esTerminal()).toBe(false);
    });
  });

  describe('permiteEntrada()', () => {
    it('devuelve true SOLO para "in_progress"', () => {
      expect(new ExamServerStatus('in_progress').permiteEntrada()).toBe(true);
    });

    it('devuelve false para "scheduled"', () => {
      expect(new ExamServerStatus('scheduled').permiteEntrada()).toBe(false);
    });

    it('devuelve false para "finalized"', () => {
      expect(new ExamServerStatus('finalized').permiteEntrada()).toBe(false);
    });
  });
});
