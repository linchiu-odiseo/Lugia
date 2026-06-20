import { describe, it, expect } from 'vitest';
import { TutorExam } from '../../../../src/L1_domain/entities/tutor-exam';
import { ExamServerStatus } from '../../../../src/L1_domain/value-objects/exam-server-status';

// Helper para construir TutorExam de prueba con defaults razonables.
function buildTutorExam(status: 'scheduled' | 'in_progress' | 'finalized', overrides?: {
  count?: number | null;
  courseId?: string | null;
}) {
  return new TutorExam({
    detailId: 'det-1',
    recordId: 'rec-1',
    classroomId: 'cls-1',
    entryId: 'ent-1',
    serverStatus: new ExamServerStatus(status),
    name: 'Examen de prueba',
    courseId: overrides?.courseId !== undefined ? overrides.courseId : 'c-1',
    count: overrides?.count !== undefined ? overrides.count : 10,
    duration: 3600,
    startedAt: status === 'scheduled' ? null : new Date('2026-06-10T08:00:00Z'),
    finishedAt: status === 'finalized' ? new Date('2026-06-10T09:00:00Z') : null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
  });
}

describe('TutorExam', () => {
  describe('puedeIniciar()', () => {
    it('retorna true cuando status es "scheduled"', () => {
      const exam = buildTutorExam('scheduled');
      expect(exam.puedeIniciar()).toBe(true);
    });

    it('retorna false cuando status es "in_progress"', () => {
      const exam = buildTutorExam('in_progress');
      expect(exam.puedeIniciar()).toBe(false);
    });

    it('retorna false cuando status es "finalized"', () => {
      const exam = buildTutorExam('finalized');
      expect(exam.puedeIniciar()).toBe(false);
    });
  });

  describe('puedeFinalizar()', () => {
    it('retorna true cuando status es "in_progress"', () => {
      const exam = buildTutorExam('in_progress');
      expect(exam.puedeFinalizar()).toBe(true);
    });

    it('retorna false cuando status es "scheduled"', () => {
      const exam = buildTutorExam('scheduled');
      expect(exam.puedeFinalizar()).toBe(false);
    });

    it('retorna false cuando status es "finalized"', () => {
      const exam = buildTutorExam('finalized');
      expect(exam.puedeFinalizar()).toBe(false);
    });
  });

  describe('estaFinalizado()', () => {
    it('retorna true cuando status es "finalized"', () => {
      const exam = buildTutorExam('finalized');
      expect(exam.estaFinalizado()).toBe(true);
    });

    it('retorna false cuando status es "scheduled"', () => {
      const exam = buildTutorExam('scheduled');
      expect(exam.estaFinalizado()).toBe(false);
    });

    it('retorna false cuando status es "in_progress"', () => {
      const exam = buildTutorExam('in_progress');
      expect(exam.estaFinalizado()).toBe(false);
    });
  });

  describe('campos nullable', () => {
    it('acepta count: null (tipo válido — number | null)', () => {
      const exam = buildTutorExam('scheduled', { count: null });
      // TypeScript compila — y en runtime el campo es null
      expect(exam.count).toBeNull();
    });

    it('acepta courseId: null (tipo válido — string | null)', () => {
      const exam = buildTutorExam('scheduled', { courseId: null });
      expect(exam.courseId).toBeNull();
    });
  });
});
