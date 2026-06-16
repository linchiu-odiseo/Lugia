import { describe, it, expect, beforeEach } from 'vitest';
import { MarcarRespuestaUseCase } from '../../../src/L2_application/use-cases/marcar-respuesta.use-case';
import { Alternativa } from '../../../src/L1_domain/value-objects/alternativa';
import { InvalidMarcacionError } from '../../../src/L1_domain/errors/invalid-marcacion.error';
import { InMemoryMarkingsStorage } from './fakes';

describe('MarcarRespuestaUseCase', () => {
  let storage: InMemoryMarkingsStorage;
  let useCase: MarcarRespuestaUseCase;

  beforeEach(() => {
    storage = new InMemoryMarkingsStorage();
    useCase = new MarcarRespuestaUseCase(storage);
  });

  describe('happy path — marcar', () => {
    it('persiste la marca con la letra en storage', async () => {
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 5,
        alternativa: Alternativa.fromString('C'),
      });

      const marcaciones = await storage.getMarcaciones('exam-001');
      expect(marcaciones).toEqual({ '5': 'C' });
    });

    it('registra una invocación a setMarcacion en el opsLog', async () => {
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 5,
        alternativa: Alternativa.fromString('C'),
      });

      expect(storage.getOpsLog()).toEqual(['markings.setMarcacion']);
    });

    it('sobreescribe la marca previa cuando se marca otra letra en la misma pregunta', async () => {
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 5,
        alternativa: Alternativa.fromString('C'),
      });
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 5,
        alternativa: Alternativa.fromString('A'),
      });

      const marcaciones = await storage.getMarcaciones('exam-001');
      expect(marcaciones).toEqual({ '5': 'A' });
    });

    it('soporta múltiples preguntas independientes del mismo simulacro', async () => {
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 1,
        alternativa: Alternativa.fromString('A'),
      });
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 2,
        alternativa: Alternativa.fromString('B'),
      });
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 3,
        alternativa: Alternativa.fromString('E'),
      });

      const marcaciones = await storage.getMarcaciones('exam-001');
      expect(marcaciones).toEqual({ '1': 'A', '2': 'B', '3': 'E' });
    });
  });

  describe('happy path — desmarcar (null)', () => {
    it('persiste null cuando se invoca con Alternativa.desmarcada()', async () => {
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 5,
        alternativa: Alternativa.desmarcada(),
      });

      const marcaciones = await storage.getMarcaciones('exam-001');
      expect(marcaciones).toEqual({ '5': null });
    });

    it('desmarcar tras marcar previamente sobreescribe a null', async () => {
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 5,
        alternativa: Alternativa.fromString('C'),
      });
      await useCase.execute({
        examId: 'exam-001',
        pregunta: 5,
        alternativa: Alternativa.desmarcada(),
      });

      const marcaciones = await storage.getMarcaciones('exam-001');
      expect(marcaciones).toEqual({ '5': null });
    });
  });

  describe('invariantes — examId inválido', () => {
    it('rechaza examId vacío con InvalidMarcacionError sin tocar storage', async () => {
      await expect(
        useCase.execute({
          examId: '',
          pregunta: 5,
          alternativa: Alternativa.fromString('C'),
        }),
      ).rejects.toThrow(InvalidMarcacionError);

      expect(storage.hasAnyState()).toBe(false);
      expect(storage.getOpsLog()).toEqual([]);
    });

    it('rechaza examId whitespace con InvalidMarcacionError sin tocar storage', async () => {
      await expect(
        useCase.execute({
          examId: '   ',
          pregunta: 5,
          alternativa: Alternativa.fromString('C'),
        }),
      ).rejects.toThrow(InvalidMarcacionError);

      expect(storage.hasAnyState()).toBe(false);
      expect(storage.getOpsLog()).toEqual([]);
    });
  });

  describe('invariantes — pregunta inválida', () => {
    it('rechaza pregunta = 0 con InvalidMarcacionError sin tocar storage', async () => {
      await expect(
        useCase.execute({
          examId: 'exam-001',
          pregunta: 0,
          alternativa: Alternativa.fromString('C'),
        }),
      ).rejects.toThrow(InvalidMarcacionError);

      expect(storage.hasAnyState()).toBe(false);
      expect(storage.getOpsLog()).toEqual([]);
    });

    it('rechaza pregunta negativa con InvalidMarcacionError sin tocar storage', async () => {
      await expect(
        useCase.execute({
          examId: 'exam-001',
          pregunta: -3,
          alternativa: Alternativa.fromString('C'),
        }),
      ).rejects.toThrow(InvalidMarcacionError);

      expect(storage.hasAnyState()).toBe(false);
    });

    it('rechaza pregunta no-entera con InvalidMarcacionError sin tocar storage', async () => {
      await expect(
        useCase.execute({
          examId: 'exam-001',
          pregunta: 1.5,
          alternativa: Alternativa.fromString('C'),
        }),
      ).rejects.toThrow(InvalidMarcacionError);

      expect(storage.hasAnyState()).toBe(false);
    });
  });

  describe('aislamiento por examen', () => {
    it('marcaciones de un examen no aparecen al leer otro', async () => {
      await useCase.execute({
        examId: 'exam-A',
        pregunta: 1,
        alternativa: Alternativa.fromString('A'),
      });
      await useCase.execute({
        examId: 'exam-B',
        pregunta: 1,
        alternativa: Alternativa.fromString('B'),
      });

      expect(await storage.getMarcaciones('exam-A')).toEqual({ '1': 'A' });
      expect(await storage.getMarcaciones('exam-B')).toEqual({ '1': 'B' });
    });
  });
});
