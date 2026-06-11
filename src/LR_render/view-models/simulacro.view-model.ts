import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ObtenerSimulacrosDelDiaUseCase } from '../../L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { MarcarRespuestaUseCase } from '../../L2_application/use-cases/marcar-respuesta.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../app.config';
import { Simulacro } from '../../L1_domain/entities/simulacro';
import { Alternativa } from '../../L1_domain/value-objects/alternativa';
import { AlternativaValue, AnswersMap } from '../../L1_domain/ports/markings-storage';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { SessionExpiredError } from '../../L1_domain/errors/session-expired.error';

// Razón de redirect al /home, lo usa el view-model para no renderizar UI de
// error en la página. Si en el futuro queremos un toast global, el `flash`
// del router (state) es el canal natural.
export type SimulacroErrorState =
  | 'not-found'
  | 'pendiente'
  | 'enviado'
  | 'cerrado'
  | 'expired-during-session'
  | 'session-expired'
  | 'network'
  | 'unknown';

// El countdown re-renderiza cada segundo. Mismo patrón que HomePageViewModel:
// nowTick es un signal puro alimentado por el puerto Clock (server-anchored).
const COUNTDOWN_TICK_MS = 1_000;

// Umbral para cambiar el formato del countdown: por debajo de 5 minutos
// queremos ver los segundos para que el alumno sienta la urgencia; por encima
// con minutos basta y la pantalla no parpadea cada segundo en algo irrelevante.
const SHOW_SECONDS_BELOW_MS = 5 * 60_000;

// View-model de /simulacro/:id. Provider-local a SimulacroPage (no providedIn
// root) para que cada montaje arranque limpio sus timers y estado.
//
// DEUDA: hoy reutilizamos ObtenerSimulacrosDelDiaUseCase y filtramos en cliente.
// Cuando el backend exponga GET /simulacros/{id} sería más limpio un
// ObtenerSimulacroPorIdUseCase dedicado — evita traer N-1 simulacros que no
// vamos a usar y separa la responsabilidad de "lista del día" de "uno".
@Injectable()
export class SimulacroPageViewModel {
  private readonly obtenerSimulacros = inject(ObtenerSimulacrosDelDiaUseCase);
  private readonly marcarRespuesta = inject(MarcarRespuestaUseCase);
  private readonly markings = inject(MARKINGS_STORAGE);
  private readonly clock = inject(CLOCK);
  private readonly router = inject(Router);

  readonly simulacro = signal<Simulacro | null>(null);
  readonly marcaciones = signal<AnswersMap>({});
  readonly isLoading = signal(false);
  readonly errorState = signal<SimulacroErrorState | null>(null);
  readonly nowTick = signal<Date>(this.clock.now());

  // Lista derivada de números de pregunta 1..count. Recomputa solo cuando
  // cambia el simulacro — barato.
  readonly preguntas: Signal<readonly number[]> = computed(() => {
    const s = this.simulacro();
    if (s === null) return [];
    return Array.from({ length: s.count }, (_, i) => i + 1);
  });

  // Countdown formateado para el header. Recomputa cada segundo (al cambiar
  // nowTick) y cuando se setea/cambia el simulacro.
  readonly countdownRestante: Signal<string> = computed(() => {
    const s = this.simulacro();
    if (s === null) return '';
    const remainingMs = s.fin.getTime() - this.nowTick().getTime();
    return formatRestante(remainingMs);
  });

  // Hora de cierre como "HH:MM" para mostrar junto al countdown.
  readonly cierreHHMM: Signal<string> = computed(() => {
    const s = this.simulacro();
    if (s === null) return '';
    return formatHHMM(s.fin);
  });

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private stopped = false;

  async start(simulacroId: string): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopped = false;

    const trimmedId = simulacroId.trim();
    if (trimmedId.length === 0) {
      this.errorState.set('not-found');
      void this.router.navigate(['/home']);
      return;
    }

    this.isLoading.set(true);
    let lista: readonly Simulacro[];
    try {
      lista = await this.obtenerSimulacros.execute();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        this.errorState.set('session-expired');
        void this.router.navigate(['/login']);
        return;
      } else if (err instanceof NetworkError) {
        this.errorState.set('network');
        void this.router.navigate(['/home']);
        return;
      } else {
        this.errorState.set('unknown');
        void this.router.navigate(['/home']);
        throw err;
      }
    } finally {
      this.isLoading.set(false);
    }

    const encontrado = lista.find((s) => s.id === trimmedId);
    if (encontrado === undefined) {
      this.errorState.set('not-found');
      void this.router.navigate(['/home']);
      return;
    }

    if (!encontrado.estado.is('abierto')) {
      // Mapea estado → razón de redirect. La spec define qué mensaje mostrar
      // por estado; la traducción a copy concreta puede vivir en /home (toast)
      // o en este map si después lo movemos a un servicio compartido.
      const estado = encontrado.estado.value;
      this.errorState.set(estado === 'abierto' ? 'unknown' : estado);
      void this.router.navigate(['/home']);
      return;
    }

    this.simulacro.set(encontrado);
    await this.loadMarcaciones(encontrado);
    this.startCountdownTicker();
  }

  stop(): void {
    this.stopped = true;
    this.stopCountdownTicker();
  }

  // Toggle de marca. Si la nueva letra coincide con la actual → desmarca
  // (null). Si difiere o no había marca previa → marca la nueva.
  //
  // Actualizamos el signal localmente con el resultado para que la UI
  // reaccione sin esperar a re-leer todo el map del storage; el use case
  // ya valida y persiste antes de devolver.
  async marcar(pregunta: number, letra: AlternativaValue): Promise<void> {
    if (this.stopped) return;
    const s = this.simulacro();
    if (s === null) return;

    const actual = this.marcaciones()[String(pregunta)] ?? null;
    const proxima: AlternativaValue = actual === letra ? null : letra;

    // Persistencia fallida no debería ocurrir en condiciones normales (la
    // home ya hizo el precheck de IndexedDB). Si fallara, dejamos que el
    // error propague para no silenciar bugs y la UI queda consistente con
    // el storage (no actualizamos el signal porque la línea siguiente no
    // se ejecuta).
    await this.marcarRespuesta.execute({
      simulacroId: s.id,
      pregunta,
      alternativa: Alternativa.fromString(proxima),
    });

    this.marcaciones.update((prev) => ({ ...prev, [String(pregunta)]: proxima }));
  }

  volver(): void {
    void this.router.navigate(['/home']);
  }

  private async loadMarcaciones(s: Simulacro): Promise<void> {
    const stored = await this.markings.getMarcaciones(s.id);
    // Inicializamos el map con todas las preguntas presentes (null por
    // defecto) y sobreescribimos con lo que vino del storage. El template
    // así puede leer marcaciones()[String(p)] sin chequeos extra de undefined.
    const fullMap: AnswersMap = {};
    for (let i = 1; i <= s.count; i++) {
      fullMap[String(i)] = stored[String(i)] ?? null;
    }
    this.marcaciones.set(fullMap);
  }

  private startCountdownTicker(): void {
    if (this.countdownTimer !== null) return;
    this.countdownTimer = setInterval(() => {
      if (this.stopped) return;
      const now = this.clock.now();
      this.nowTick.set(now);
      this.maybeRedirectIfExpired(now);
    }, COUNTDOWN_TICK_MS);
  }

  private stopCountdownTicker(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  // Si mientras la página está montada el tiempo cruza `fin`, redirigimos a
  // /home. El estado oficial del simulacro lo derivará el backend en el
  // próximo GET de /home; nuestra autoridad local es el `fin` ya recibido
  // (anclado al server-time vía Clock).
  //
  // NO hacemos polling al backend desde acá: agregaría carga sin valor —
  // /home ya refresca cada 120s y al volver vemos el estado actualizado.
  // En sec.9 esta misma detección dispara `ProgramarAutoEnvioUseCase`.
  private maybeRedirectIfExpired(now: Date): void {
    const s = this.simulacro();
    if (s === null) return;
    if (now.getTime() < s.fin.getTime()) return;
    if (this.errorState() !== null) return;
    this.errorState.set('expired-during-session');
    this.stopCountdownTicker();
    void this.router.navigate(['/home']);
  }
}

function formatHHMM(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// Formato adaptativo:
//   ≥ 5 min   → "X min restantes"
//   < 5 min   → "MM:SS"
//   ≤ 0       → "00:00"
// Con tabular-nums en el template el "MM:SS" no salta horizontalmente al
// caer cada segundo.
function formatRestante(ms: number): string {
  if (ms <= 0) return '00:00';
  if (ms >= SHOW_SECONDS_BELOW_MS) {
    const mins = Math.ceil(ms / 60_000);
    return `${mins} min restantes`;
  }
  const totalSeconds = Math.ceil(ms / 1_000);
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const ss = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
