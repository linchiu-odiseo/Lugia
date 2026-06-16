import { Injectable, computed, inject, signal } from '@angular/core';
import { GetIdentityUseCase } from '../../L2_application/use-cases/get-identity.use-case';
import { GetProfileUseCase } from '../../L2_application/use-cases/get-profile.use-case';
import { TutorProfile } from '../../L1_domain/value-objects/tutor-profile';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { ProfileNotAvailableError } from '../../L1_domain/errors/profile-not-available.error';

// View-model de /tutor/home. Provider-local al TutorHomePage para que cada
// montaje arranque limpio. A diferencia de StudentHomePageViewModel, este
// stub NO hace polling ni precheck de IndexedDB: el tutor por ahora solo
// consulta su perfil y aulas. Capacidades futuras (gestión de exámenes)
// vendrán en changes posteriores.
@Injectable()
export class TutorHomePageViewModel {
  private readonly getIdentity = inject(GetIdentityUseCase);
  private readonly getProfile = inject(GetProfileUseCase);

  // Identity siempre disponible bajo authGuard + roleGuard('tutor'). El email
  // de identity puede diferir del email del profile (ej: cuenta admin que
  // gestiona un tutor). Por convención el header prefiere `profileEmail` y
  // cae al `userEmail` si el profile no resolvió.
  readonly userEmail = signal<string | null>(null);

  // Datos del perfil (`/tutor/me`). Mientras el fetch está en vuelo se
  // muestran como skeleton. Si el backend devuelve 403/404
  // (`ProfileNotAvailableError`) la UI cae a degraded state.
  readonly userName = signal<string | null>(null);
  readonly userCode = signal<string | null>(null);
  readonly profileEmail = signal<string | null>(null);
  readonly classroomCount = signal<number>(0);
  readonly studentTotal = signal<number>(0);
  readonly profileLoading = signal(false);
  readonly profileUnavailable = signal(false);

  // Computed derivados: hasClassrooms gobierna el switch stats↔empty-state;
  // statsText se consume desde el template para una sola línea estable.
  readonly hasClassrooms = computed(() => this.classroomCount() > 0);
  readonly statsText = computed(() => {
    if (!this.hasClassrooms()) return null;
    return `Tenés ${this.classroomCount()} aulas · ${this.studentTotal()} alumnos`;
  });

  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const identity = await this.getIdentity.execute();
    if (!identity) {
      // Estado raro: authGuard normalmente ya redirigió. Dejamos header vacío.
      this.userEmail.set(null);
      return;
    }
    this.userEmail.set(identity.email);

    this.profileLoading.set(true);
    try {
      const profile = (await this.getProfile.execute('tutor')) as TutorProfile;
      this.userName.set(`${profile.firstName} ${profile.lastName}`);
      this.userCode.set(profile.code);
      this.profileEmail.set(profile.email);
      this.classroomCount.set(profile.classrooms.length);
      this.studentTotal.set(profile.classrooms.reduce((sum, c) => sum + c.studentCount, 0));
    } catch (err) {
      if (err instanceof ProfileNotAvailableError) {
        // Tutor con identity válida pero sin fila en `tutors` (seed inconsistente
        // o user recién provisionado). Degradamos a solo email.
        this.profileUnavailable.set(true);
      } else if (err instanceof NetworkError) {
        // Sin perfil pero sesión OK — no rompemos el home; queda con email.
      } else {
        // Bug del programador o error no modelado: re-lanzar.
        throw err;
      }
    } finally {
      this.profileLoading.set(false);
    }
  }
}
