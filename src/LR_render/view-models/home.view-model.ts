import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GetIdentityUseCase } from '../../L2_application/use-cases/get-identity.use-case';
import { GetProfileUseCase } from '../../L2_application/use-cases/get-profile.use-case';
import { ObtenerSimulacrosDelDiaUseCase } from '../../L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { CLOCK, MARKINGS_STORAGE } from '../../app.config';
import { Simulacro } from '../../L1_domain/entities/simulacro';
import { EstadoValue } from '../../L1_domain/value-objects/estado-simulacro';
import { StudentProfile } from '../../L1_domain/value-objects/student-profile';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { SessionExpiredError } from '../../L1_domain/errors/session-expired.error';
import { ProfileNotAvailableError } from '../../L1_domain/errors/profile-not-available.error';
import { OfflineStorageUnavailableError } from '../../L1_domain/errors/offline-storage-unavailable.error';
import { randomQuote } from '../pages/home/inspirational-quotes';

export type ServerErrorKind = 'network' | 'session-expired' | 'unknown';

// Cada 120s mientras la pestaña está visible: refresca la lista contra backend.
const POLL_INTERVAL_MS = 120_000;

// El countdown re-renderiza cada segundo. Lo separamos del polling porque son
// dos relojes con razones distintas: este es solo cosmético (texto del countdown),
// el otro recoge cambios de estado del backend.
const COUNTDOWN_TICK_MS = 1_000;

// View-model de /home. Provider-local al HomePage (no providedIn root) para que
// cada montaje arranque limpio sus timers y listeners.
@Injectable()
export class HomePageViewModel {
  private readonly getIdentity = inject(GetIdentityUseCase);
  private readonly getProfile = inject(GetProfileUseCase);
  private readonly obtenerSimulacros = inject(ObtenerSimulacrosDelDiaUseCase);
  private readonly clock = inject(CLOCK);
  private readonly markings = inject(MARKINGS_STORAGE);
  private readonly router = inject(Router);

  readonly simulacros = signal<readonly Simulacro[]>([]);
  readonly isLoading = signal(false);
  readonly serverError = signal<ServerErrorKind | null>(null);
  readonly offlineStorageBlocked = signal(false);
  readonly lastRefreshAt = signal<Date | null>(null);

  // Header del home alumno. `userEmail` viene de la identity (siempre presente
  // bajo authGuard + roleGuard('student')). `userName` (`firstName + lastName`)
  // y `userDni` (`profile.code`) vienen del `GetProfileUseCase` que fetchea
  // `/student/me` en paralelo. Mientras la promesa está en vuelo, ambos son
  // null y el template muestra skeleton. Si el back devuelve 403/404
  // (`ProfileNotAvailableError`), `profileUnavailable` se prende y la UI
  // muestra degraded state con solo email.
  readonly userEmail = signal<string | null>(null);
  readonly userName = signal<string | null>(null);
  readonly userDni = signal<string | null>(null);
  readonly profileLoading = signal(false);
  readonly profileUnavailable = signal(false);

  // Cita ambient de splash-Minecraft / epígrafe: una frase fija por mount.
  // No rota durante el polling de 120 s — distraería. Si el alumno recarga
  // la página, vuelve randomQuote() a sortear.
  readonly quote = signal(randomQuote());
  // nowTick re-emite cada segundo desde el puerto Clock (server-anchored) para
  // que los countdowns derivados rerendericen sin que el template tenga lógica
  // de tiempo. NUNCA leer Date.now() directo desde la UI.
  readonly nowTick = signal<Date>(this.clock.now());

  // Cards derivadas: estado, copy y countdown. Recomputa cuando cambia la lista
  // o cada tick del reloj.
  readonly cards = computed(() => this.simulacros().map((s) => this.buildCard(s, this.nowTick())));

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityListener: (() => void) | null = null;
  private started = false;
  private stopped = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopped = false;

    // Profile en paralelo (no bloquea precheck ni refresh). Cuando resuelve,
    // los signals userEmail/userName/userDni re-emiten y el template re-renderea
    // reactivamente — el header puede mostrar el saludo sin haber esperado a la
    // lista de simulacros. Mantiene la misma semántica que el `void loadEmail()`
    // que hacía el page component pre-C4.
    void this.loadUserProfile();
    await this.runOfflineStoragePrecheck();
    await this.refresh();

    this.startCountdownTicker();
    this.startPollingIfVisible();
    this.attachVisibilityListener();
  }

  stop(): void {
    this.stopped = true;
    this.stopPolling();
    this.stopCountdownTicker();
    this.detachVisibilityListener();
  }

  async refresh(): Promise<void> {
    if (this.stopped) return;
    this.isLoading.set(true);
    try {
      const list = await this.obtenerSimulacros.execute();
      this.handleAbiertosDegradation(list);
      this.simulacros.set(list);
      this.serverError.set(null);
      this.lastRefreshAt.set(this.clock.now());
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        this.serverError.set('session-expired');
        // Limpieza completa la hace el interceptor / logout silencioso; aquí
        // solo redirigimos para no quedarnos pintando una lista vieja.
        void this.router.navigate(['/login']);
      } else if (err instanceof NetworkError) {
        this.serverError.set('network');
      } else {
        this.serverError.set('unknown');
        // Bug del programador o error no modelado: re-lanzar para no silenciar.
        throw err;
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  // Lee identity (email instantáneo desde IdentityStorage) y fetchea profile
  // (firstName + lastName + code/DNI desde /student/me con cache 24h).
  // Email se publica de inmediato; nombre y DNI llegan cuando el profile
  // resuelve. Errores benignos (sin identity, sin profile) degradan
  // silenciosamente — el header muestra lo que tiene.
  private async loadUserProfile(): Promise<void> {
    const identity = await this.getIdentity.execute();
    if (!identity) {
      // Estado raro: el authGuard normalmente ya redirigió. Dejamos el
      // header vacío sin lanzar.
      this.userEmail.set(null);
      return;
    }
    this.userEmail.set(identity.email);

    this.profileLoading.set(true);
    try {
      const profile = (await this.getProfile.execute('student')) as StudentProfile;
      this.userName.set(`${profile.firstName} ${profile.lastName}`);
      this.userDni.set(profile.code);
    } catch (err) {
      if (err instanceof ProfileNotAvailableError) {
        // Caso conocido: user con rol student pero sin fila en `students`
        // (seed inconsistente o user nuevo). Degradamos a solo email.
        this.profileUnavailable.set(true);
      } else if (err instanceof NetworkError) {
        // Sin perfil pero sesión OK — no rompemos el home; solo no mostramos
        // nombre/dni. El próximo refresh manual lo intenta de nuevo.
      } else {
        // Bug del programador o error no modelado: re-lanzar.
        throw err;
      }
    } finally {
      this.profileLoading.set(false);
    }
  }

  // Pre-check temprano de IndexedDB. ObtenerSimulacrosDelDia no toca el storage,
  // pero queremos detectar IDB unavailable ANTES de que el alumno tape en una
  // card abierta y fracase en /simulacro/:id.
  private async runOfflineStoragePrecheck(): Promise<void> {
    try {
      await this.markings.getEnviosPendientes();
      this.offlineStorageBlocked.set(false);
    } catch (err) {
      if (err instanceof OfflineStorageUnavailableError) {
        this.offlineStorageBlocked.set(true);
      } else {
        // Otros errores del storage no son de UI: los dejamos propagar a consola.
        // No bloqueamos la lista ni mostramos banner por algo no clasificado.
        console.error('MarkingsStorage precheck unexpected error', err);
      }
    }
  }

  private handleAbiertosDegradation(list: readonly Simulacro[]): void {
    const abiertos = list.filter((s) => s.estado.is('abierto'));
    if (abiertos.length > 1) {
      console.warn(
        `Backend devolvió ${abiertos.length} simulacros abiertos simultáneos; ` +
          `tratando el primero (${abiertos[0].id}) como activo.`,
      );
    }
  }

  private startCountdownTicker(): void {
    this.countdownTimer = setInterval(() => {
      if (this.stopped) return;
      this.nowTick.set(this.clock.now());
    }, COUNTDOWN_TICK_MS);
  }

  private stopCountdownTicker(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private startPollingIfVisible(): void {
    if (this.pollTimer !== null) return;
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;
    this.pollTimer = setInterval(() => {
      if (this.stopped) return;
      void this.refresh();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private attachVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    const handler = (): void => {
      if (this.stopped) return;
      if (document.visibilityState === 'visible') {
        void this.refresh();
        this.startPollingIfVisible();
      } else {
        this.stopPolling();
      }
    };
    document.addEventListener('visibilitychange', handler);
    this.visibilityListener = handler;
  }

  private detachVisibilityListener(): void {
    if (this.visibilityListener !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
    this.visibilityListener = null;
  }

  private buildCard(s: Simulacro, now: Date): SimulacroCard {
    const estado = s.estado.value;
    const clickable = estado === 'abierto';
    const tone: CardTone = clickable ? 'verde' : 'gris';

    return {
      id: s.id,
      area: s.area,
      name: s.name,
      count: s.count,
      estado,
      clickable,
      tone,
      primaryText: this.primaryText(s, now),
      secondaryText: this.secondaryText(s),
    };
  }

  private primaryText(s: Simulacro, now: Date): string {
    switch (s.estado.value) {
      case 'pendiente':
        return `Disponible a las ${formatHHMM(s.inicio)}`;
      case 'abierto': {
        const restante = msToMinutesCeiling(s.fin.getTime() - now.getTime());
        if (restante <= 0) {
          return `Cierra a las ${formatHHMM(s.fin)} · cerrando…`;
        }
        return `Cierra a las ${formatHHMM(s.fin)} · ${restante} min restantes`;
      }
      case 'enviado':
        // DEUDA: el shape del DTO de Fase 2 todavía no expone `enviadoEn`. Usamos
        // `fin` como aproximación visible. Cuando se agregue, cambiar aquí.
        return `Enviado a las ${formatHHMM(s.fin)}`;
      case 'cerrado':
        return 'No enviaste · cerrado';
    }
  }

  private secondaryText(s: Simulacro): string {
    return `${s.area} · ${s.count} preguntas`;
  }
}

export type CardTone = 'verde' | 'gris';

export interface SimulacroCard {
  id: string;
  area: string;
  name: string;
  count: number;
  estado: EstadoValue;
  clickable: boolean;
  tone: CardTone;
  primaryText: string;
  secondaryText: string;
}

function formatHHMM(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// Redondeamos hacia arriba: si faltan 30s, decimos "1 min restante" — el alumno
// se merece el aviso completo, no que el contador caiga a 0 prematuramente.
function msToMinutesCeiling(ms: number): number {
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
}
