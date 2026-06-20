import { describe, it, expect } from 'vitest';
import { VirtualExamNotFoundError } from '../../../../src/L1_domain/errors/virtual-exam-not-found.error';
import { ExamConflictError } from '../../../../src/L1_domain/errors/exam-conflict.error';
import { ExamPreconditionError } from '../../../../src/L1_domain/errors/exam-precondition.error';
import { TutorExamForbiddenError } from '../../../../src/L1_domain/errors/tutor-exam-forbidden.error';
import { ExamServerStatus } from '../../../../src/L1_domain/value-objects/exam-server-status';

describe('Errores de dominio del tutor', () => {
  describe('VirtualExamNotFoundError (HTTP 404)', () => {
    it('es instanceof Error', () => {
      expect(new VirtualExamNotFoundError()).toBeInstanceOf(Error);
    });

    it('es instanceof VirtualExamNotFoundError', () => {
      expect(new VirtualExamNotFoundError()).toBeInstanceOf(VirtualExamNotFoundError);
    });

    it('tiene name correcto', () => {
      expect(new VirtualExamNotFoundError().name).toBe('VirtualExamNotFoundError');
    });
  });

  describe('ExamConflictError (HTTP 409)', () => {
    it('es instanceof Error', () => {
      expect(new ExamConflictError()).toBeInstanceOf(Error);
    });

    it('es instanceof ExamConflictError', () => {
      expect(new ExamConflictError()).toBeInstanceOf(ExamConflictError);
    });

    it('tiene name correcto', () => {
      expect(new ExamConflictError().name).toBe('ExamConflictError');
    });
  });

  describe('ExamPreconditionError (HTTP 422)', () => {
    it('es instanceof Error', () => {
      expect(new ExamPreconditionError()).toBeInstanceOf(Error);
    });

    it('es instanceof ExamPreconditionError', () => {
      expect(new ExamPreconditionError()).toBeInstanceOf(ExamPreconditionError);
    });

    it('tiene name correcto', () => {
      expect(new ExamPreconditionError().name).toBe('ExamPreconditionError');
    });
  });

  describe('TutorExamForbiddenError (HTTP 403)', () => {
    it('es instanceof Error', () => {
      expect(new TutorExamForbiddenError()).toBeInstanceOf(Error);
    });

    it('es instanceof TutorExamForbiddenError', () => {
      expect(new TutorExamForbiddenError()).toBeInstanceOf(TutorExamForbiddenError);
    });

    it('tiene name correcto', () => {
      expect(new TutorExamForbiddenError().name).toBe('TutorExamForbiddenError');
    });
  });

  describe('ExamServerStatus — reutilizado sin modificar', () => {
    it('sigue aceptando los 3 valores conocidos', () => {
      expect(new ExamServerStatus('scheduled').value).toBe('scheduled');
      expect(new ExamServerStatus('in_progress').value).toBe('in_progress');
      expect(new ExamServerStatus('finalized').value).toBe('finalized');
    });

    it('is() sigue funcionando', () => {
      const s = new ExamServerStatus('scheduled');
      expect(s.is('scheduled')).toBe(true);
      expect(s.is('in_progress')).toBe(false);
    });

    it('esTerminal() sigue retornando true solo para finalized', () => {
      expect(new ExamServerStatus('finalized').esTerminal()).toBe(true);
      expect(new ExamServerStatus('scheduled').esTerminal()).toBe(false);
    });
  });
});
