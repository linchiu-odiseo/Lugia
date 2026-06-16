import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GetTodaysExamsUseCase } from '../../L2_application/use-cases/get-todays-exams.use-case';
import { MarcarRespuestaUseCase } from '../../L2_application/use-cases/marcar-respuesta.use-case';
import { EnviarSimulacroUseCase } from '../../L2_application/use-cases/enviar-simulacro.use-case';
import {
  AutoEnvioHandle,
  ProgramarAutoEnvioUseCase,
} from '../../L2_application/use-cases/programar-auto-envio.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../app.config';
import { Exam } from '../../L1_domain/entities/exam';
import { Alternativa } from '../../L1_domain/value-objects/alternativa';
import { AlternativaValue, AnswersMap } from '../../L1_domain/ports/markings-storage';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { SessionExpiredError } from '../../L1_domain/errors/session-expired.error';
import { SimulacroCerradoError } from '../../L1_domain/errors/simulacro-cerrado.error';
import { SimulacroNoAsignadoError } from '../../L1_domain/errors/simulacro-no-asignado.error';
import { InvalidSubmissionTimeError } from '../../L1_domain/errors/invalid-submission-time.error';
import { InvalidPayloadError } from '../../L1_domain/errors/invalid-payload.error';

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
  | 'invalid-submission-time'
  | 'invalid-payload'
  | 'unknown';

// Estado del flujo de envío. 'idle' antes de cualquier intento;
// 'sending' mientras el POST está en vuelo; 'sent' tras éxito (la página
// va a /home, por lo que el alumno no llega a verlo casi); 'queued' cuando
// el POST falló por NetworkError y el envío quedó en cola para retry — el
// alumno se queda en la página viendo el banner naranja hasta que decida
// volver manualmente o expire el ticker.
export type SubmissionState = 'idle' | 'sending' | 'sent' | 'queued' | 'error';

// Estado de protección por fila contra cambios accidentales. La grilla
// permite marcar en 1 tap cualquier pregunta vacía, pero modificar una ya
// marcada requiere un gesto deliberado (long-press) que pone la fila en
// `editing` por un tiempo limitado. Ver Requirement "Protección contra
// cambios accidentales" en exam-marking.spec.md.
//
//   unmarked → marca con 1 tap → locked
//   locked   → long-press 500ms en la fila → editing
//   editing  → tap en burbuja aplica cambio → locked (o unmarked si borró)
//   editing  → 5s sin acción / scroll / long-press otra fila → locked
export type SimulacroRowState = 'unmarked' | 'locked' | 'editing';

// El countdown re-renderiza cada segundo. Mismo patrón que HomePageViewModel:
// nowTick es un signal puro alimentado por el puerto Clock (server-anchored).
const COUNTDOWN_TICK_MS = 1_000;

// Umbral para cambiar el formato del countdown: por debajo de 5 minutos
// queremos ver los segundos para que el alumno sienta la urgencia; por encima
// con minutos basta y la pantalla no parpadea cada segundo en algo irrelevante.
const SHOW_SECONDS_BELOW_MS = 5 * 60_000;

// Cuánto dura el modo `editing` antes de auto-bloquearse si el alumno no
// toca nada. Elegido balanceando "tiempo suficiente para reaccionar" vs
// "volver pronto a la protección". 5s es lo que mostraba el preview de UX.
const EDITING_AUTO_LOCK_MS = 5_000;

// View-model de /simulacro/:id. Provider-local a SimulacroPage (no providedIn
// root) para que cada montaje arranque limpio sus timers y estado.
//
// DEUDA: hoy reutilizamos GetTodaysExamsUseCase y filtramos en cliente. Cuando
// learnex exponga `GET /t/{slug}/student/exam-sessions/{id}` sería más limpio
// un ObtenerExamenPorIdUseCase dedicado — evita traer N-1 exámenes que no
// vamos a usar y separa la responsabilidad de "lista del día" de "uno".
@Injectable()
export class SimulacroPageViewModel {
  private readonly getTodaysExams = inject(GetTodaysExamsUseCase);
  private readonly marcarRespuesta = inject(MarcarRespuestaUseCase);
  private readonly enviarSimulacro = inject(EnviarSimulacroUseCase);
  private readonly programarAutoEnvio = inject(ProgramarAutoEnvioUseCase);
  private readonly markings = inject(MARKINGS_STORAGE);
  private readonly clock = inject(CLOCK);
  private readonly router = inject(Router);

  readonly exam = signal<Exam | null>(null);
  readonly marcaciones = signal<AnswersMap>({});
  readonly isLoading = signal(false);
  readonly errorState = signal<SimulacroErrorState | null>(null);
  readonly nowTick = signal<Date>(this.clock.now());
  readonly isSubmitting = signal(false);
  readonly submissionState = signal<SubmissionState>('idle');

  // Número de la pregunta cuya fila está actualmente en modo `editing`, o
  // null si ninguna lo está. Solo puede haber una a la vez — entrar a
  // edición en otra cierra la anterior automáticamente. El template usa
  // este signal para mostrar el chip flotante "Toca para cambiar" sobre
  // la fila editing.
  readonly editingRow = signal<number | null>(null);

  // Lista derivada de números de pregunta 1..count. Recomputa solo cuando
  // cambia el examen — barato.
  readonly preguntas: Signal<readonly number[]> = computed(() => {
    const e = this.exam();
    if (e === null) return [];
    return Array.from({ length: e.count }, (_, i) => i + 1);
  });

  // Countdown formateado para el header. Recomputa cada segundo (al cambiar
  // nowTick) y cuando se setea/cambia el examen. Cuenta hasta el cierre
  // efectivo (`effectiveCloseAt`) usando `started` como referencia mínima.
  // Cuando `effectiveCloseAt` es null (examen aún no activado por el tutor),
  // retorna vacío — el banner "tomando un café" comunica el estado.
  readonly countdownRestante: Signal<string> = computed(() => {
    const e = this.exam();
    if (e === null) return '';
    const closeAt = e.effectiveCloseAt();
    if (closeAt === null) return '';
    const anchor = e.started ?? e.scheduled;
    const referenceNow = Math.max(this.nowTick().getTime(), anchor.getTime());
    const remainingMs = Math.max(0, closeAt.getTime() - referenceNow);
    return formatRestante(remainingMs);
  });

  // Hora de cierre efectivo como "HH:MM" para mostrar junto al countdown.
  // Lo decide el dominio (`Exam.effectiveCloseAt()`): `finished` si learnex
  // ya lo emitió, sino `started + duration`. Vacío cuando aún no es
  // determinable (examen no activado).
  readonly cierreHHMM: Signal<string> = computed(() => {
    const e = this.exam();
    if (e === null) return '';
    const closeAt = e.effectiveCloseAt();
    if (closeAt === null) return '';
    return formatHHMM(closeAt);
  });

  // True cuando el reloj cliente aún no cruzó `started`. La página usa
  // este signal para mostrar el banner "tomando un café" y para
  // deshabilitar el botón Enviar — el examen es entrable (status =
  // in_progress) pero no vigente todavía.
  // `Exam.hasStartedBy(now)` devuelve false también cuando `started === null`,
  // caso defensivo: si llegara así, banner aparece y Enviar queda gris.
  readonly examenNoIniciado: Signal<boolean> = computed(() => {
    const e = this.exam();
    if (e === null) return false;
    return !e.hasStartedBy(this.nowTick());
  });

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private autoEnvioHandle: AutoEnvioHandle | null = null;
  private editingTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private stopped = false;

  async start(examId: string): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopped = false;

    const trimmedId = examId.trim();
    if (trimmedId.length === 0) {
      this.errorState.set('not-found');
      void this.router.navigate(['/home']);
      return;
    }

    this.isLoading.set(true);
    let lista: readonly Exam[];
    try {
      lista = await this.getTodaysExams.execute();
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

    const encontrado = lista.find((e) => e.id === trimmedId);
    if (encontrado === undefined) {
      this.errorState.set('not-found');
      void this.router.navigate(['/home']);
      return;
    }

    if (!encontrado.serverStatus.permiteEntrada()) {
      // Mapea status servidor → razón de redirect. `scheduled` → 'pendiente';
      // `finalized` → 'cerrado'. La traducción a copy concreta vive en /home.
      const status = encontrado.serverStatus.value;
      const reason: SimulacroErrorState =
        status === 'scheduled' ? 'pendiente' : status === 'finalized' ? 'cerrado' : 'unknown';
      this.errorState.set(reason);
      void this.router.navigate(['/home']);
      return;
    }

    // `in_progress` con `started` en el futuro NO bloquea entrada: el
    // alumno entra pero ve el banner `examenNoIniciado` y la grilla
    // queda accesible. Las marcaciones se guardan en IDB; el countdown
    // arranca cuando el reloj cliente cruza `started`.

    this.exam.set(encontrado);
    await this.loadMarcaciones(encontrado);
    this.startCountdownTicker();
    this.scheduleAutoEnvio(encontrado);
  }

  stop(): void {
    this.stopped = true;
    this.stopCountdownTicker();
    this.cancelAutoEnvio();
    this.cancelEditingTimer();
    this.editingRow.set(null);
  }

  // Estado actual de la fila para una pregunta. Reactivo: depende de los
  // signals `marcaciones` y `editingRow`. El template lo invoca para
  // decidir clases CSS y comportamiento.
  rowState(pregunta: number): SimulacroRowState {
    if (this.editingRow() === pregunta) return 'editing';
    const marca = this.marcaciones()[String(pregunta)] ?? null;
    return marca === null ? 'unmarked' : 'locked';
  }

  // Entrar a modo edición en una fila. Solo aplica si la fila está `locked`
  // (no tiene sentido en `unmarked` — el primer tap ya cambia, no protege).
  // Cierra cualquier edición previa (solo una fila a la vez), arma el
  // timeout de auto-bloqueo, y dispara un pulso háptico si el navegador lo
  // soporta. Sin efecto si el componente ya se destruyó.
  enterEditing(pregunta: number): void {
    if (this.stopped) return;
    if (this.rowState(pregunta) !== 'locked') return;

    this.cancelEditingTimer();
    this.editingRow.set(pregunta);
    this.tryHapticPulse();

    this.editingTimer = setTimeout(() => {
      this.editingTimer = null;
      if (this.editingRow() === pregunta) {
        this.editingRow.set(null);
      }
    }, EDITING_AUTO_LOCK_MS);
  }

  // Salir de modo edición sin aplicar cambios. Llamada desde el page al
  // detectar scroll/cancel del gesto, o internamente desde `marcar` tras
  // aplicar el cambio.
  exitEditing(): void {
    this.cancelEditingTimer();
    this.editingRow.set(null);
  }

  // Aplica una marca/desmarca/cambio en una pregunta SI la fila lo permite:
  //
  //   - `unmarked`: marca con la letra recibida → la fila pasa a `locked`.
  //   - `editing`:  toggle con la letra (si coincide con la actual desmarca,
  //                 si difiere cambia) → la fila vuelve a `locked` o
  //                 `unmarked` según el resultado, cancelando el timeout.
  //   - `locked`:   NO aplica el cambio. La ausencia de cambio visual ES el
  //                 feedback: el alumno descubre el long-press por uso real,
  //                 y cuando lo activa ve el chip "Toca para cambiar" sobre
  //                 la fila editing (template responde a `rowState() ===
  //                 'editing'`). No hay toast inicial ni hint inline.
  //
  // Esta es la única puerta para mutaciones de marcaciones desde la UI —
  // así el invariante de "no se cambia sin gesto deliberado" no depende de
  // disciplina del template.
  async marcar(pregunta: number, letra: AlternativaValue): Promise<void> {
    if (this.stopped) return;
    const e = this.exam();
    if (e === null) return;

    const state = this.rowState(pregunta);
    if (state === 'locked') {
      return;
    }

    const actual = this.marcaciones()[String(pregunta)] ?? null;
    const proxima: AlternativaValue = actual === letra ? null : letra;

    // Persistencia fallida no debería ocurrir en condiciones normales (la
    // home ya hizo el precheck de IndexedDB). Si fallara, dejamos que el
    // error propague para no silenciar bugs y la UI queda consistente con
    // el storage (no actualizamos el signal porque la línea siguiente no
    // se ejecuta).
    await this.marcarRespuesta.execute({
      examId: e.id,
      pregunta,
      alternativa: Alternativa.fromString(proxima),
    });

    this.marcaciones.update((prev) => ({ ...prev, [String(pregunta)]: proxima }));
    // Volver a `locked` (o `unmarked` derivado por rowState) cancelando el
    // timer de edición si estábamos en `editing`. Si veníamos de `unmarked`
    // estas llamadas son no-op pero seguras.
    this.exitEditing();
  }

  volver(): void {
    void this.router.navigate(['/home']);
  }

  // Envío manual disparado por el botón "Enviar". Idempotente frente a
  // doble click (si ya hay un POST en vuelo no relanza). Cancela primero
  // el auto-envío para que el manual gane: nunca queremos que el timer
  // dispare un segundo POST mientras el alumno ya está enviando.
  //
  // Si el use case retorna `status === 'queued'` significa que el POST
  // falló por NetworkError; el use case ya encoló el envío. La página NO
  // navega — el alumno se queda viendo el banner naranja. El dispatcher
  // global (EnvioRetryDispatcher) hace el retry cuando vuelve la red; el
  // alumno puede tocar "Volver" cuando quiera, el envío ya está en cola.
  async submit(): Promise<void> {
    if (this.isSubmitting()) return;
    const e = this.exam();
    if (e === null) return;
    if (!e.serverStatus.permiteEntrada()) return;

    this.cancelAutoEnvio();
    this.isSubmitting.set(true);
    this.submissionState.set('sending');

    try {
      const result = await this.enviarSimulacro.execute({ examId: e.id });
      if (result.status === 'enviado') {
        this.submissionState.set('sent');
        void this.router.navigate(['/home']);
      } else {
        this.submissionState.set('queued');
      }
    } catch (err) {
      this.handleSubmissionError(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // Programa el auto-envío en el momento de cierre del examen. Los callbacks
  // viven en el view-model para que cuando el timer dispare la UI reaccione
  // en signals locales — el use case no conoce ni el Router ni el estado.
  //
  // Edge case: si el alumno ya inició un envío manual (`isSubmitting=true`)
  // cuando el timer dispara, el manual ya canceló este handle en `submit()`,
  // así que el callback NO debería correr. Lo defensivo aquí es no relanzar
  // estado de envío encima si ya hay uno en vuelo.
  private scheduleAutoEnvio(exam: Exam): void {
    this.cancelAutoEnvio();
    this.autoEnvioHandle = this.programarAutoEnvio.execute({
      exam,
      onResult: (result) => {
        // El timer ya disparó: el handle representa un cancelable agotado.
        // Lo soltamos para que `maybeRedirectIfExpired` no quede bloqueado
        // indefinidamente si el auto-envío terminó en `enviado` y vuelve
        // alguna corrida del ticker antes de `stop()`.
        this.autoEnvioHandle = null;
        if (this.isSubmitting()) return;
        if (this.stopped) return;
        if (result.status === 'enviado') {
          this.submissionState.set('sent');
          void this.router.navigate(['/home']);
        } else {
          this.submissionState.set('queued');
        }
      },
      onError: (err) => {
        this.autoEnvioHandle = null;
        if (this.isSubmitting()) return;
        if (this.stopped) return;
        this.handleSubmissionError(err);
      },
    });
  }

  private cancelAutoEnvio(): void {
    if (this.autoEnvioHandle !== null) {
      this.autoEnvioHandle.cancel();
      this.autoEnvioHandle = null;
    }
  }

  private cancelEditingTimer(): void {
    if (this.editingTimer !== null) {
      clearTimeout(this.editingTimer);
      this.editingTimer = null;
    }
  }

  // Pulso háptico opcional al entrar a modo edición. `navigator.vibrate`
  // existe en Chrome Android y Firefox; en iOS Safari devuelve undefined o
  // ignora la llamada. Encapsulado con guard para no romper el view-model
  // en entornos de test (jsdom) o navegadores sin la API.
  private tryHapticPulse(): void {
    if (typeof navigator === 'undefined') return;
    const vibrate = (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean })
      .vibrate;
    if (typeof vibrate !== 'function') return;
    try {
      // Pasamos [40] (array) en vez de 40 (number) porque la definición de
      // tipos en lib.dom.d.ts de Angular 22 espera Iterable<number>.
      // Funcionalmente equivalente: un pulso único de 40ms.
      vibrate.call(navigator, [40]);
    } catch {
      // Algunos navegadores tiran si la pestaña no está visible o si el
      // usuario no interactuó aún. No nos importa — el feedback háptico
      // es nice-to-have, no funcional.
    }
  }

  // Mapea errores del envío a errorState + redirect. NetworkError no debería
  // llegar acá: EnviarSimulacroUseCase lo captura y devuelve `status: queued`.
  // Aun así lo dejamos por defensa: si llegara, lo tratamos como red caída.
  //
  // SubmissionNotAvailableError (POST stub en este change) cae en la rama
  // genérica de "unknown" → redirect a /home sin copy especial. Cuando el
  // POST real aterrice en `fase-3-exam-submit-learnex`, este error desaparece
  // de runtime.
  private handleSubmissionError(err: unknown): void {
    this.submissionState.set('error');
    if (err instanceof SimulacroCerradoError) {
      this.errorState.set('cerrado');
      void this.router.navigate(['/home']);
      return;
    }
    if (err instanceof SimulacroNoAsignadoError) {
      this.errorState.set('not-found');
      void this.router.navigate(['/home']);
      return;
    }
    if (err instanceof InvalidSubmissionTimeError) {
      this.errorState.set('invalid-submission-time');
      void this.router.navigate(['/home']);
      return;
    }
    if (err instanceof InvalidPayloadError) {
      this.errorState.set('invalid-payload');
      void this.router.navigate(['/home']);
      return;
    }
    if (err instanceof SessionExpiredError) {
      this.errorState.set('session-expired');
      void this.router.navigate(['/login']);
      return;
    }
    if (err instanceof NetworkError) {
      this.errorState.set('network');
      void this.router.navigate(['/home']);
      return;
    }
    this.errorState.set('unknown');
    void this.router.navigate(['/home']);
    throw err;
  }

  private async loadMarcaciones(e: Exam): Promise<void> {
    const stored = await this.markings.getMarcaciones(e.id);
    // Inicializamos el map con todas las preguntas presentes (null por
    // defecto) y sobreescribimos con lo que vino del storage. El template
    // así puede leer marcaciones()[String(p)] sin chequeos extra de undefined.
    const fullMap: AnswersMap = {};
    for (let i = 1; i <= e.count; i++) {
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

  // Si mientras la página está montada el tiempo cruza el cierre, redirigimos
  // a /home. El estado oficial del examen lo derivará learnex en el próximo
  // GET de /home; nuestra autoridad local es el cierre ya recibido
  // (anclado al server-time vía Clock).
  //
  // NO hacemos polling al backend desde acá: agregaría carga sin valor —
  // /home ya refresca cada 120s y al volver vemos el estado actualizado.
  //
  // Coordinación con el auto-envío: cuando hay un `autoEnvioHandle` vivo o
  // un envío en vuelo o ya quedó `queued`, NO redirigimos — dejamos que el
  // callback del auto-envío decida (navega tras éxito, mantiene la página
  // si quedó en cola). Sin esto, el ticker correría primero y cancelaría
  // el auto-envío en `stop()` antes de que el timer dispare.
  private maybeRedirectIfExpired(now: Date): void {
    const e = this.exam();
    if (e === null) return;
    const closeAt = e.effectiveCloseAt();
    // Examen aún no activado: no hay cierre determinable, nada que expirar.
    if (closeAt === null) return;
    if (now.getTime() < closeAt.getTime()) return;
    if (this.errorState() !== null) return;
    if (this.autoEnvioHandle !== null) return;
    if (this.isSubmitting()) return;
    if (this.submissionState() === 'queued') return;
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
