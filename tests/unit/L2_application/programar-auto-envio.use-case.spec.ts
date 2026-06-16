import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProgramarAutoEnvioUseCase } from '../../../src/L2_application/use-cases/programar-auto-envio.use-case';
import { EnviarSimulacroUseCase } from '../../../src/L2_application/use-cases/enviar-simulacro.use-case';
import { Exam } from '../../../src/L1_domain/entities/exam';
import { ExamServerStatus } from '../../../src/L1_domain/value-objects/exam-server-status';
import { ServerTime } from '../../../src/L1_domain/value-objects/server-time';
import { FakeClock, FakeExamsApi, InMemoryMarkingsStorage } from './fakes';

// Stub mínimo del EnviarSimulacroUseCase para tests del programador: nos
// importa SOLO si .execute() fue invocado y con qué input. Usamos una
// subclase para preservar el tipo. La implementación real se cubre en
// `enviar-simulacro.use-case.spec.ts`.
class StubEnviarSimulacroUseCase extends EnviarSimulacroUseCase {
  public calls: { examId: string; override?: Date }[] = [];
  private mode: 'resolve' | 'reject' = 'resolve';
  private nextError: Error | null = null;

  constructor() {
    super(new FakeExamsApi(), new InMemoryMarkingsStorage(), new FakeClock());
  }

  willResolve(): void {
    this.mode = 'resolve';
  }

  willReject(error: Error): void {
    this.mode = 'reject';
    this.nextError = error;
  }

  override async execute(input: {
    examId: string;
    clientSubmittedAtOverride?: Date;
  }): Promise<{ status: 'enviado' | 'queued'; clientSubmittedAt: string }> {
    this.calls.push({
      examId: input.examId,
      override: input.clientSubmittedAtOverride,
    });
    if (this.mode === 'reject' && this.nextError !== null) {
      throw this.nextError;
    }
    return {
      status: 'enviado',
      clientSubmittedAt: input.clientSubmittedAtOverride?.toISOString() ?? new Date().toISOString(),
    };
  }
}

// Cubre `ProgramarAutoEnvioUseCase` (L2):
// - Auto-envío a (started ?? scheduled) + duration*1000 con jitter ±3s.
// - clientSubmittedAtOverride = cierre exacto, NO el momento del disparo.
// - El factor en el cálculo del cierre es ×1000 (segundos), NUNCA ×60000.
describe('ProgramarAutoEnvioUseCase', () => {
  let enviar: StubEnviarSimulacroUseCase;
  let clock: FakeClock;
  let useCase: ProgramarAutoEnvioUseCase;

  const NOW_ISO = '2026-06-11T08:00:00.000Z';
  // started 30s antes de now. Con duration 90s, el cierre cae 60s después de now.
  const STARTED_ISO = '2026-06-11T07:59:30.000Z';
  // scheduled 60s antes de started — usado en escenarios de fallback (started null).
  const SCHEDULED_ISO = '2026-06-11T07:58:30.000Z';

  const buildExam = (
    overrides: Partial<{
      started: Date | null;
      scheduled: Date;
      duration: number;
      serverStatusValue: 'scheduled' | 'in_progress' | 'finalized';
    }> = {},
  ): Exam => {
    const statusValue = overrides.serverStatusValue ?? 'in_progress';
    return new Exam({
      id: 'exam-1',
      area: 'Matemática',
      course: null,
      type: 'simulacro',
      name: 'Examen 1',
      count: 20,
      duration: overrides.duration ?? 90,
      scheduled: overrides.scheduled ?? new Date(SCHEDULED_ISO),
      started: 'started' in overrides ? overrides.started ?? null : new Date(STARTED_ISO),
      finished: null,
      serverStatus: new ExamServerStatus(statusValue),
    });
  };

  beforeEach(() => {
    enviar = new StubEnviarSimulacroUseCase();
    clock = new FakeClock();
    clock.setServerTime(new ServerTime(NOW_ISO));
    useCase = new ProgramarAutoEnvioUseCase(enviar, clock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('disparo del timer — in_progress con started', () => {
    it('al cumplirse delay (60s + jitter=0), invoca enviar.execute con override = (started + duration*1000)', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter=0
      const exam = buildExam(); // started=NOW-30s, duration=90s → cierre = NOW+60s
      enviar.willResolve();

      useCase.execute({ exam });

      // Aún no llegó el tiempo: 0 calls.
      expect(enviar.calls).toHaveLength(0);

      // Avanzamos 63s para cubrir cualquier jitter posible.
      await vi.advanceTimersByTimeAsync(63_000);

      expect(enviar.calls).toHaveLength(1);
      expect(enviar.calls[0].examId).toBe('exam-1');
      expect(enviar.calls[0].override).toBeInstanceOf(Date);
      // Crítico: override === started + duration*1000 = NOW+60s (NO el momento del disparo).
      const expectedClose = new Date(STARTED_ISO).getTime() + 90 * 1000;
      expect(enviar.calls[0].override?.getTime()).toBe(expectedClose);
    });

    it('cancel() antes del fire NO invoca enviar.execute', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const exam = buildExam();
      enviar.willResolve();

      const handle = useCase.execute({ exam });
      handle.cancel();

      await vi.advanceTimersByTimeAsync(63_000);

      expect(enviar.calls).toHaveLength(0);
    });

    it('onResult callback se invoca con el resultado del enviar', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const exam = buildExam();
      enviar.willResolve();
      const results: { status: string; clientSubmittedAt: string }[] = [];

      useCase.execute({
        exam,
        onResult: (r) => results.push(r),
      });

      await vi.advanceTimersByTimeAsync(63_000);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('enviado');
      const expectedCloseIso = new Date(
        new Date(STARTED_ISO).getTime() + 90 * 1000,
      ).toISOString();
      expect(results[0].clientSubmittedAt).toBe(expectedCloseIso);
    });

    it('onError callback se invoca cuando enviar lanza', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const exam = buildExam();
      const boom = new Error('boom!');
      enviar.willReject(boom);
      const errors: unknown[] = [];

      useCase.execute({
        exam,
        onError: (e) => errors.push(e),
      });

      await vi.advanceTimersByTimeAsync(63_000);

      expect(errors).toEqual([boom]);
    });
  });

  describe('disparo del timer — scheduled (started null, fallback)', () => {
    // Cuando started es null (caso scheduled), el anchor del cierre es scheduled.
    // Con SCHEDULED 90s antes de NOW y duration=180s → cierre = NOW+90s.
    it('usa scheduled cuando started es null — override = (scheduled + duration*1000)', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const exam = buildExam({
        scheduled: new Date(SCHEDULED_ISO),
        started: null,
        duration: 180,
        serverStatusValue: 'scheduled',
      });
      enviar.willResolve();

      useCase.execute({ exam });

      await vi.advanceTimersByTimeAsync(93_000);

      expect(enviar.calls).toHaveLength(1);
      const expectedClose = new Date(SCHEDULED_ISO).getTime() + 180 * 1000;
      expect(enviar.calls[0].override?.getTime()).toBe(expectedClose);
    });
  });

  describe('factor ×1000 (segundos, NO minutos)', () => {
    // GUARDIÁN crítico contra regresión a ×60_000 (la fórmula vieja de
    // Fase 2 cuando `duration` venía en minutos). Si alguien revierte
    // a ×60_000, este test falla en segundos.
    it('duration=60 (segundos) con started=NOW dispara a NOW+60s — NO NOW+3600s', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const exam = buildExam({
        started: new Date(NOW_ISO),
        scheduled: new Date(NOW_ISO),
        duration: 60,
      });
      enviar.willResolve();

      useCase.execute({ exam });

      // Si fuera ×60_000, el delay sería 3600_000ms. Confirmamos que a los
      // 59999ms aún no disparó y a los 60000ms sí.
      await vi.advanceTimersByTimeAsync(59_999);
      expect(enviar.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(enviar.calls).toHaveLength(1);

      // Override exacto = started + 60_000ms (NO + 3_600_000ms).
      const expected = new Date(NOW_ISO).getTime() + 60_000;
      expect(enviar.calls[0].override?.getTime()).toBe(expected);
    });
  });

  describe('jitter', () => {
    // El jitter es: (Math.random() * 2 - 1) * 3000.
    //   X=0.5 → jitter = 0
    //   X=1.0 → jitter = +3000
    //   X=0.0 → jitter = -3000
    // Con exam donde started=NOW-30s y duration=90 → cierre = NOW+60s.
    // Verificamos el delay efectivo por cuándo el timer dispara.

    it('Math.random=0.5 → jitter=0, delay = 60_000ms exactos', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const exam = buildExam();
      enviar.willResolve();

      useCase.execute({ exam });

      await vi.advanceTimersByTimeAsync(59_999);
      expect(enviar.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(enviar.calls).toHaveLength(1);
    });

    it('Math.random=1.0 → jitter=+3000, delay = 63_000ms', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(1.0);
      const exam = buildExam();
      enviar.willResolve();

      useCase.execute({ exam });

      await vi.advanceTimersByTimeAsync(62_999);
      expect(enviar.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(enviar.calls).toHaveLength(1);
    });

    it('Math.random=0.0 → jitter=-3000, delay = 57_000ms', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);
      const exam = buildExam();
      enviar.willResolve();

      useCase.execute({ exam });

      await vi.advanceTimersByTimeAsync(56_999);
      expect(enviar.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(enviar.calls).toHaveLength(1);
    });
  });

  describe('clamping del delay', () => {
    it('si cierre <= ahora (examen ya cerrado al programar), delay=0 (dispara inmediato)', async () => {
      vi.useFakeTimers();
      // Math.random=0.0 daría jitter -3000ms; pero `Math.max(0, ...)` clampa.
      vi.spyOn(Math, 'random').mockReturnValue(0.0);
      // cierre == NOW: started == NOW y duration=0 no es válido, así que
      // usamos duration=1 con started=NOW-1s → cierre cae justo en NOW.
      const exam = buildExam({
        started: new Date(new Date(NOW_ISO).getTime() - 1000),
        duration: 1,
      });
      enviar.willResolve();

      useCase.execute({ exam });

      // En el siguiente tick del event loop dispara con delay=0.
      await vi.advanceTimersByTimeAsync(0);

      expect(enviar.calls).toHaveLength(1);
      const expectedClose = exam.started!.getTime() + exam.duration * 1000;
      expect(enviar.calls[0].override?.getTime()).toBe(expectedClose);
    });
  });
});
