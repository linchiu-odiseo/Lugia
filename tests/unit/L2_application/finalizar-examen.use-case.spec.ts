import { describe, it, expect, beforeEach } from 'vitest';
import { FinalizarExamenUseCase } from '../../../src/L2_application/use-cases/finalizar-examen.use-case';
import { ExamConflictError } from '../../../src/L1_domain/errors/exam-conflict.error';
import { FakeTutorExamsApi } from './fakes';

describe('FinalizarExamenUseCase', () => {
  let api: FakeTutorExamsApi;
  let useCase: FinalizarExamenUseCase;

  beforeEach(() => {
    api = new FakeTutorExamsApi();
    useCase = new FinalizarExamenUseCase(api);
  });

  it('delega execute({ recordId }) y retorna FinalizeResult sin transformación', async () => {
    const expected = { transitioned: true, jobId: 'job-xyz' };
    api.willResolveFinalizar(expected);

    const result = await useCase.execute({ recordId: 'rec-1' });

    expect(result).toEqual({ transitioned: true, jobId: 'job-xyz' });
    expect(api.getFinalizarCalls()).toEqual(['rec-1']);
  });

  it('propaga FinalizeResult { transitioned: false } sin error (idempotente)', async () => {
    api.willResolveFinalizar({ transitioned: false });
    const result = await useCase.execute({ recordId: 'rec-1' });
    expect(result.transitioned).toBe(false);
  });

  it('propaga ExamConflictError sin envoltorio', async () => {
    api.willRejectFinalizar(new ExamConflictError());
    await expect(useCase.execute({ recordId: 'rec-1' })).rejects.toBeInstanceOf(ExamConflictError);
  });
});
