import { Injectable, inject, signal } from '@angular/core';
import { GetTutorExamsUseCase } from '../../L2_application/use-cases/get-tutor-exams.use-case';
import { GetProfileUseCase } from '../../L2_application/use-cases/get-profile.use-case';
import { TutorExamsStore } from '../state/tutor-exams.store';
import { TutorExam } from '../../L1_domain/entities/tutor-exam';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { TutorProfile } from '../../L1_domain/value-objects/tutor-profile';
import { ProfileNotAvailableError } from '../../L1_domain/errors/profile-not-available.error';

// Cada 120s mientras la pestaña está visible: refresca la lista del tutor
// contra el backend. Mismo patrón que HomePageViewModel.
const POLL_INTERVAL_MS = 120_000;

// View-model de /tutor/home (lista de exámenes del tutor). Provider-local al
// TutorExamsListPage (NO providedIn root) para que cada montaje arranque
// limpio sus timers y listeners.
@Injectable()
export class TutorExamsListViewModel {
  private readonly getTutorExams = inject(GetTutorExamsUseCase);
  private readonly getProfile = inject(GetProfileUseCase);
  private readonly store = inject(TutorExamsStore);

  // Lista de exámenes del tutor. Inicia vacía; se populará en el primer load.
  readonly exams = signal<readonly TutorExam[]>([]);
  // true mientras GetTutorExamsUseCase está en vuelo.
  readonly loading = signal(true);
  // true si el último fetch resultó en NetworkError. El polling continúa.
  readonly error = signal(false);

  // Header del tutor: datos del perfil desde GetProfileUseCase('tutor').
  readonly userName = signal<string | null>(null);
  readonly userEmail = signal<string | null>(null);
  readonly profileLoading = signal(false);
  readonly profileUnavailable = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityListener: (() => void) | null = null;
  private started = false;
  private stopped = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopped = false;

    // Cargar perfil en paralelo (no bloquea el fetch de exámenes).
    void this.loadProfile();
    await this.refresh();

    this.startPollingIfVisible();
    this.attachVisibilityListener();
  }

  stop(): void {
    this.stopped = true;
    this.stopPolling();
    this.detachVisibilityListener();
  }

  async refresh(): Promise<void> {
    if (this.stopped) return;
    this.loading.set(true);
    try {
      const list = await this.getTutorExams.execute();
      this.exams.set(list);
      this.store.setExams(list);
      this.error.set(false);
    } catch (err) {
      if (err instanceof NetworkError) {
        // Activa el error signal pero mantiene la lista anterior y continúa
        // el polling — el próximo tick intentará de nuevo.
        this.error.set(true);
      } else {
        // Error no modelado: re-lanzar para no silenciar bugs.
        throw err;
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    this.profileLoading.set(true);
    try {
      const profile = (await this.getProfile.execute('tutor')) as TutorProfile;
      this.userName.set(`${profile.firstName} ${profile.lastName}`);
      this.userEmail.set(profile.email);
    } catch (err) {
      if (err instanceof ProfileNotAvailableError) {
        this.profileUnavailable.set(true);
      } else if (err instanceof NetworkError) {
        // Sin perfil pero sesión OK — el header no muestra nombre.
      } else {
        throw err;
      }
    } finally {
      this.profileLoading.set(false);
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
}
