import { describe, it, expect, beforeEach } from 'vitest';
import { ActualizarAlumnosHabilitadosUseCase } from '../../../src/L2_application/use-cases/actualizar-alumnos-habilitados.use-case';
import { ExamConflictError } from '../../../src/L1_domain/errors/exam-conflict.error';
import { FakeTutorExamsApi } from './fakes';

describe('ActualizarAlumnosHabilitadosUseCase', () => {
  let api: FakeTutorExamsApi;
  let useCase: ActualizarAlumnosHabilitadosUseCase;

  beforeEach(() => {
    api = new FakeTutorExamsApi();
    useCase = new ActualizarAlumnosHabilitadosUseCase(api);
  });

  it('delega execute({ recordId, enabledStudentIds }) a updateEnabledStudents() → void', async () => {
    api.willResolveUpdateEnabledStudents();

    await expect(
      useCase.execute({ recordId: 'rec-1', enabledStudentIds: ['s-1', 's-2'] }),
    ).resolves.toBeUndefined();

    const calls = api.getUpdateEnabledStudentsCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ recordId: 'rec-1', enabledStudentIds: ['s-1', 's-2'] });
  });

  it('propaga ExamConflictError sin envoltorio', async () => {
    api.willRejectUpdateEnabledStudents(new ExamConflictError());
    await expect(
      useCase.execute({ recordId: 'rec-1', enabledStudentIds: ['s-1'] }),
    ).rejects.toBeInstanceOf(ExamConflictError);
  });
});
