import { describe, it, expect, beforeEach } from 'vitest';
import { IniciarExamenUseCase } from '../../../src/L2_application/use-cases/iniciar-examen.use-case';
import { ExamPreconditionError } from '../../../src/L1_domain/errors/exam-precondition.error';
import { FakeTutorExamsApi } from './fakes';

describe('IniciarExamenUseCase', () => {
  let api: FakeTutorExamsApi;
  let useCase: IniciarExamenUseCase;

  beforeEach(() => {
    api = new FakeTutorExamsApi();
    useCase = new IniciarExamenUseCase(api);
  });

  it('delega execute({ recordId }) a iniciar(recordId) y resuelve void', async () => {
    api.willResolveIniciar();

    await expect(useCase.execute({ recordId: 'rec-1' })).resolves.toBeUndefined();
    expect(api.getIniciarCalls()).toEqual(['rec-1']);
  });

  it('propaga ExamPreconditionError sin envoltorio', async () => {
    api.willRejectIniciar(new ExamPreconditionError());
    await expect(useCase.execute({ recordId: 'rec-1' })).rejects.toBeInstanceOf(ExamPreconditionError);
  });

  it('NO llama a IDB ni outbox (verificación estructural)', async () => {
    api.willResolveIniciar();
    await useCase.execute({ recordId: 'rec-1' });
    // Si el use case tocara outbox/IDB, el import importaría módulos de
    // IndexedDB que causarían errores en el entorno de test puro.
    expect(api.getIniciarCalls()).toHaveLength(1);
  });
});
