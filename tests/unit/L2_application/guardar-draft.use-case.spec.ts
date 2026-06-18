import { describe, it, expect, beforeEach } from 'vitest';
import { GuardarDraftUseCase } from '../../../src/L2_application/use-cases/guardar-draft.use-case';
import { DraftRequest, ExamsApi, ExamsListResult } from '../../../src/L1_domain/ports/exams-api';
import { Identity } from '../../../src/L1_domain/entities/identity';
import { SessionExpiredError } from '../../../src/L1_domain/errors/session-expired.error';
import { SimulacroCerradoError } from '../../../src/L1_domain/errors/simulacro-cerrado.error';
import {
  FakeIdentityStorage,
  InMemoryMarkingsStorage,
} from './fakes';

// Fake ExamsApi mínimo para GuardarDraftUseCase — solo implementa guardarDraft.
class FakeDraftExamsApi implements ExamsApi {
  private draftPlan:
    | { kind: 'resolve' }
    | { kind: 'reject'; error: Error }
    | null = null;

  public draftCalls: DraftRequest[] = [];

  willResolveDraft(): void {
    this.draftPlan = { kind: 'resolve' };
  }

  willRejectDraft(error: Error): void {
    this.draftPlan = { kind: 'reject', error };
  }

  async guardarDraft(req: DraftRequest): Promise<void> {
    this.draftCalls.push({ ...req });
    if (!this.draftPlan) {
      throw new Error('FakeDraftExamsApi: configurar willResolveDraft o willRejectDraft');
    }
    if (this.draftPlan.kind === 'reject') throw this.draftPlan.error;
  }

  // Métodos del port ExamsApi que no usa este use case.
  async getTodaysExams(): Promise<ExamsListResult> {
    throw new Error('Not used in draft tests');
  }
  async enviar(): Promise<never> {
    throw new Error('Not used in draft tests');
  }
}

const VALID_CODIGO = '30303011';
const VALID_EMAIL = '30303011@vonex.edu.pe';

function studentIdentity(codigo: string | null = VALID_CODIGO): Identity {
  return new Identity(
    'user-id',
    'tenant-id',
    VALID_EMAIL,
    codigo,
    ['student'],
    [],
    Date.now() + 900_000,
  );
}

describe('GuardarDraftUseCase', () => {
  let api: FakeDraftExamsApi;
  let storage: InMemoryMarkingsStorage;
  let identityStorage: FakeIdentityStorage;
  let useCase: GuardarDraftUseCase;

  beforeEach(async () => {
    api = new FakeDraftExamsApi();
    storage = new InMemoryMarkingsStorage();
    identityStorage = new FakeIdentityStorage();
    await identityStorage.write(studentIdentity());
    useCase = new GuardarDraftUseCase(api, storage, identityStorage);
  });

  describe('Reshape AnswersMap', () => {
    it('filtra nulls y prefija keys con P', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      storage.seedMarcacion('exam-1', 2, null);
      storage.seedMarcacion('exam-1', 5, 'D');
      api.willResolveDraft();

      await useCase.execute({ examId: 'exam-1' });

      expect(api.draftCalls).toHaveLength(1);
      expect(api.draftCalls[0].examId).toBe('exam-1');
      expect(api.draftCalls[0].code).toBe(VALID_CODIGO);
      expect(api.draftCalls[0].responses).toEqual({ P1: 'A', P5: 'D' });
      // P2 no debe estar presente
      expect(api.draftCalls[0].responses).not.toHaveProperty('P2');
    });

    it('AnswersMap vacío produce responses vacío', async () => {
      // getMarcaciones retorna {} si no hay nada sembrado
      api.willResolveDraft();

      await useCase.execute({ examId: 'exam-1' });

      expect(api.draftCalls[0].responses).toEqual({});
    });

    it('AnswersMap todo nulls produce responses vacío', async () => {
      storage.seedMarcacion('exam-1', 1, null);
      storage.seedMarcacion('exam-1', 2, null);
      api.willResolveDraft();

      await useCase.execute({ examId: 'exam-1' });

      expect(api.draftCalls[0].responses).toEqual({});
    });
  });

  describe('Sesión expirada antes del POST', () => {
    it('identity null → SessionExpiredError sin invocar getMarcaciones ni guardarDraft', async () => {
      await identityStorage.clear();
      api.willResolveDraft();

      await expect(useCase.execute({ examId: 'exam-1' })).rejects.toBeInstanceOf(
        SessionExpiredError,
      );

      expect(api.draftCalls).toEqual([]);
      expect(storage.getOpsLog()).not.toContain('markings.setMarcacion');
    });

    it('identity.codigo === null → SessionExpiredError sin invocar guardarDraft', async () => {
      await identityStorage.write(studentIdentity(null));
      api.willResolveDraft();

      await expect(useCase.execute({ examId: 'exam-1' })).rejects.toBeInstanceOf(
        SessionExpiredError,
      );

      expect(api.draftCalls).toEqual([]);
    });
  });

  describe('Use case NO toca queue ni ack', () => {
    it('tras éxito, NO invoca enqueueEnvio ni setSubmissionAck ni clearMarcaciones', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      api.willResolveDraft();

      await useCase.execute({ examId: 'exam-1' });

      const log = storage.getOpsLog();
      expect(log).not.toContain('markings.enqueueEnvio');
      expect(log).not.toContain('markings.setSubmissionAck');
      expect(log).not.toContain('markings.clearMarcaciones');
    });
  });

  describe('Errores del port se propagan tal cual', () => {
    it('SimulacroCerradoError del port propaga sin envoltorio', async () => {
      storage.seedMarcacion('exam-1', 1, 'A');
      const error = new SimulacroCerradoError();
      api.willRejectDraft(error);

      await expect(useCase.execute({ examId: 'exam-1' })).rejects.toBe(error);
    });

    it('error genérico propaga tal cual', async () => {
      const error = new Error('error-generico');
      api.willRejectDraft(error);

      await expect(useCase.execute({ examId: 'exam-1' })).rejects.toBe(error);
    });
  });
});
