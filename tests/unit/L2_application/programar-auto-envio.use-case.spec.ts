import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProgramarAutoEnvioUseCase } from '../../../src/L2_application/use-cases/programar-auto-envio.use-case';
import { EnviarSimulacroUseCase } from '../../../src/L2_application/use-cases/enviar-simulacro.use-case';
import { Simulacro } from '../../../src/L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../../src/L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../../src/L1_domain/value-objects/server-time';
import { FakeClock, FakeSimulacrosApi, InMemoryMarkingsStorage } from './fakes';

// Stub mínimo del EnviarSimulacroUseCase para tests del programador: nos
// importa SOLO si .execute() fue invocado y con qué input. Usamos una
// subclase para preservar el tipo. La implementación real se cubre en
// `enviar-simulacro.use-case.spec.ts`.
class StubEnviarSimulacroUseCase extends EnviarSimulacroUseCase {
  public calls: { simulacroId: string; override?: Date }[] = [];
  private mode: 'resolve' | 'reject' = 'resolve';
  private nextError: Error | null = null;

  constructor() {
    super(new FakeSimulacrosApi(), new InMemoryMarkingsStorage(), new FakeClock());
  }

  willResolve(): void {
    this.mode = 'resolve';
  }

  willReject(error: Error): void {
    this.mode = 'reject';
    this.nextError = error;
  }

  override async execute(input: {
    simulacroId: string;
    clientSubmittedAtOverride?: Date;
  }): Promise<{ status: 'enviado' | 'queued'; clientSubmittedAt: string }> {
    this.calls.push({
      simulacroId: input.simulacroId,
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

// Cubre `ProgramarAutoEnvioUseCase` (L2) según spec sec.9 Req 3:
// auto-envío a T=0 con jitter ±3s y `clientSubmittedAt = fin`.
describe('ProgramarAutoEnvioUseCase', () => {
  let enviar: StubEnviarSimulacroUseCase;
  let clock: FakeClock;
  let useCase: ProgramarAutoEnvioUseCase;

  const NOW_ISO = '2026-06-11T08:00:00.000Z';
  const FIN_60S_LATER_ISO = '2026-06-11T08:01:00.000Z';

  const buildSimulacro = (finIso: string): Simulacro =>
    new Simulacro({
      id: 'sim-1',
      area: 'Matemática',
      name: 'Simulacro 1',
      count: 20,
      inicio: new Date('2026-06-11T07:00:00.000Z'),
      fin: new Date(finIso),
      estado: new EstadoSimulacro('abierto'),
    });

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

  describe('disparo del timer', () => {
    it('al cumplirse delay (60s + jitter), invoca enviar.execute con clientSubmittedAtOverride=simulacro.fin', async () => {
      vi.useFakeTimers();
      // Jitter ∈ [-3s, +3s] usa Math.random. Stubeamos a 0.5 para jitter=0.
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const sim = buildSimulacro(FIN_60S_LATER_ISO);
      enviar.willResolve();

      useCase.execute({ simulacro: sim });

      // Aún no llegó el tiempo: 0 calls.
      expect(enviar.calls).toHaveLength(0);

      // Avanzamos 63s para cubrir cualquier jitter posible.
      await vi.advanceTimersByTimeAsync(63_000);

      expect(enviar.calls).toHaveLength(1);
      expect(enviar.calls[0].simulacroId).toBe('sim-1');
      expect(enviar.calls[0].override).toBeInstanceOf(Date);
      // Crítico: clientSubmittedAtOverride === simulacro.fin exactamente
      // (NO el momento del disparo).
      expect(enviar.calls[0].override?.getTime()).toBe(sim.fin.getTime());
    });

    it('cancel() antes del fire NO invoca enviar.execute', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const sim = buildSimulacro(FIN_60S_LATER_ISO);
      enviar.willResolve();

      const handle = useCase.execute({ simulacro: sim });
      handle.cancel();

      await vi.advanceTimersByTimeAsync(63_000);

      expect(enviar.calls).toHaveLength(0);
    });

    it('onResult callback se invoca con el resultado del enviar', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const sim = buildSimulacro(FIN_60S_LATER_ISO);
      enviar.willResolve();
      const results: { status: string; clientSubmittedAt: string }[] = [];

      useCase.execute({
        simulacro: sim,
        onResult: (r) => results.push(r),
      });

      await vi.advanceTimersByTimeAsync(63_000);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('enviado');
      expect(results[0].clientSubmittedAt).toBe(FIN_60S_LATER_ISO);
    });

    it('onError callback se invoca cuando enviar lanza', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const sim = buildSimulacro(FIN_60S_LATER_ISO);
      const boom = new Error('boom!');
      enviar.willReject(boom);
      const errors: unknown[] = [];

      useCase.execute({
        simulacro: sim,
        onError: (e) => errors.push(e),
      });

      await vi.advanceTimersByTimeAsync(63_000);

      expect(errors).toEqual([boom]);
    });
  });

  describe('jitter', () => {
    // El jitter es: (Math.random() * 2 - 1) * 3000. Con Math.random=X
    //   X=0.5 → jitter = 0
    //   X=1.0 → jitter = +3000
    //   X=0.0 → jitter = -3000
    // Verificamos el delay efectivo por cuándo el timer dispara.

    it('Math.random=0.5 → jitter=0, delay = (fin - now) = 60_000ms exactos', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const sim = buildSimulacro(FIN_60S_LATER_ISO);
      enviar.willResolve();

      useCase.execute({ simulacro: sim });

      // Justo antes del delay → 0 calls.
      await vi.advanceTimersByTimeAsync(59_999);
      expect(enviar.calls).toHaveLength(0);
      // Justo en el delay → 1 call.
      await vi.advanceTimersByTimeAsync(1);
      expect(enviar.calls).toHaveLength(1);
    });

    it('Math.random=1.0 → jitter=+3000, delay = 63_000ms', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(1.0);
      const sim = buildSimulacro(FIN_60S_LATER_ISO);
      enviar.willResolve();

      useCase.execute({ simulacro: sim });

      await vi.advanceTimersByTimeAsync(62_999);
      expect(enviar.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(enviar.calls).toHaveLength(1);
    });

    it('Math.random=0.0 → jitter=-3000, delay = 57_000ms', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);
      const sim = buildSimulacro(FIN_60S_LATER_ISO);
      enviar.willResolve();

      useCase.execute({ simulacro: sim });

      await vi.advanceTimersByTimeAsync(56_999);
      expect(enviar.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(enviar.calls).toHaveLength(1);
    });
  });

  describe('clamping del delay', () => {
    it('si fin <= ahora (simulacro ya cerrado al programar), delay=0 (dispara inmediato)', async () => {
      vi.useFakeTimers();
      // Math.random=0.0 daría jitter -3000ms; pero `Math.max(0, ...)` clampa.
      vi.spyOn(Math, 'random').mockReturnValue(0.0);
      // fin == NOW (ya pasó la ventana cuando programamos).
      const sim = buildSimulacro(NOW_ISO);
      enviar.willResolve();

      useCase.execute({ simulacro: sim });

      // En el siguiente tick del event loop dispara con delay=0.
      await vi.advanceTimersByTimeAsync(0);

      expect(enviar.calls).toHaveLength(1);
      expect(enviar.calls[0].override?.getTime()).toBe(sim.fin.getTime());
    });
  });
});
