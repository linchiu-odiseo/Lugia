import { describe, it, expect, beforeEach } from 'vitest';
import { ListClassroomStudentsUseCase } from '../../../src/L2_application/use-cases/list-classroom-students.use-case';
import { ClassroomStudent } from '../../../src/L1_domain/value-objects/classroom-student';
import { TutorExamForbiddenError } from '../../../src/L1_domain/errors/tutor-exam-forbidden.error';
import { FakeTutorExamsApi } from './fakes';

const student1: ClassroomStudent = {
  studentId: 's-1',
  studentCode: '0001',
  firstName: 'Ana',
  lastName: 'García',
  enabled: true,
  hasSubmitted: false,
};

describe('ListClassroomStudentsUseCase', () => {
  let api: FakeTutorExamsApi;
  let useCase: ListClassroomStudentsUseCase;

  beforeEach(() => {
    api = new FakeTutorExamsApi();
    useCase = new ListClassroomStudentsUseCase(api);
  });

  it('delega execute({ classroomId, virtualExamDetailId }) y retorna ClassroomStudent[]', async () => {
    api.willResolveListClassroomStudents([student1]);

    const result = await useCase.execute({
      classroomId: 'cls-1',
      virtualExamDetailId: 'det-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(student1);
    const calls = api.getListClassroomStudentsCalls();
    expect(calls[0]).toEqual({ classroomId: 'cls-1', virtualExamDetailId: 'det-1' });
  });

  it('propaga TutorExamForbiddenError sin envoltorio', async () => {
    api.willRejectListClassroomStudents(new TutorExamForbiddenError());
    await expect(
      useCase.execute({ classroomId: 'cls-1', virtualExamDetailId: 'det-1' }),
    ).rejects.toBeInstanceOf(TutorExamForbiddenError);
  });
});
