import { describe, it, expect } from 'vitest';
import { apiPath } from '../../../../src/L3_periphery/http/api-paths';
import { environment } from '../../../../src/environments/environment';

// Specs para los 6 nuevos helpers de apiPath para endpoints del tutor.
// Satisface http-client Requirement "apiPath — 6 nuevos helpers para endpoints del tutor".
// NOTA: todos usan encodeURIComponent internamente; los tests con "special chars" lo verifican.

const BASE = `${environment.apiBaseUrl}/t/${environment.tenantSlug}`;

describe('apiPath — 6 nuevos helpers del tutor', () => {
  describe('tutorVirtualExams()', () => {
    it('retorna <base>/tutor/virtual-exams', () => {
      expect(apiPath.tutorVirtualExams()).toBe(`${BASE}/tutor/virtual-exams`);
    });
  });

  describe('virtualExam(recordId)', () => {
    it('retorna <base>/virtual-exams/rec-123 para recordId simple', () => {
      expect(apiPath.virtualExam('rec-123')).toBe(`${BASE}/virtual-exams/rec-123`);
    });

    it('aplica encodeURIComponent: "foo/bar" → "foo%2Fbar"', () => {
      expect(apiPath.virtualExam('foo/bar')).toBe(`${BASE}/virtual-exams/foo%2Fbar`);
    });
  });

  describe('classroomStudents(classroomId, virtualExamDetailId)', () => {
    it('retorna URL con classroomId en path y virtualExamDetailId en query', () => {
      expect(apiPath.classroomStudents('cls-1', 'det-abc')).toBe(
        `${BASE}/classrooms/cls-1/students?virtualExamDetailId=det-abc`,
      );
    });

    it('aplica encodeURIComponent sobre classroomId con "/" especial', () => {
      const url = apiPath.classroomStudents('cls/1', 'det abc');
      expect(url).toContain('/classrooms/cls%2F1/students');
    });

    it('aplica encodeURIComponent sobre virtualExamDetailId con espacio', () => {
      const url = apiPath.classroomStudents('cls/1', 'det abc');
      expect(url).toContain('virtualExamDetailId=det%20abc');
    });
  });

  describe('virtualExamEnabledStudents(recordId)', () => {
    it('retorna <base>/virtual-exams/rec-1/enabled-students', () => {
      expect(apiPath.virtualExamEnabledStudents('rec-1')).toBe(
        `${BASE}/virtual-exams/rec-1/enabled-students`,
      );
    });
  });

  describe('virtualExamStart(recordId)', () => {
    it('retorna <base>/virtual-exams/rec-1/start', () => {
      expect(apiPath.virtualExamStart('rec-1')).toBe(`${BASE}/virtual-exams/rec-1/start`);
    });
  });

  describe('virtualExamFinalize(recordId)', () => {
    it('retorna <base>/virtual-exams/rec-1/finalize', () => {
      expect(apiPath.virtualExamFinalize('rec-1')).toBe(`${BASE}/virtual-exams/rec-1/finalize`);
    });
  });

  describe('coexistencia con helpers pre-existentes', () => {
    it('los 6 nuevos helpers están en el mismo objeto apiPath que login, studentExamSubmit, etc.', () => {
      // Los helpers pre-existentes siguen funcionando.
      expect(typeof apiPath.login).toBe('function');
      expect(typeof apiPath.studentExamSubmit).toBe('function');
      expect(typeof apiPath.studentExamDraft).toBe('function');
      // Y los 6 nuevos existen en el mismo objeto.
      expect(typeof apiPath.tutorVirtualExams).toBe('function');
      expect(typeof apiPath.virtualExam).toBe('function');
      expect(typeof apiPath.classroomStudents).toBe('function');
      expect(typeof apiPath.virtualExamEnabledStudents).toBe('function');
      expect(typeof apiPath.virtualExamStart).toBe('function');
      expect(typeof apiPath.virtualExamFinalize).toBe('function');
    });
  });
});
