import { AuthRepository } from '../../L1_domain/ports/auth-repository';
import { ProfileStorage } from '../../L1_domain/ports/profile-storage';
import { Role } from '../../L1_domain/entities/identity';
import { StudentProfile } from '../../L1_domain/value-objects/student-profile';
import { TutorProfile } from '../../L1_domain/value-objects/tutor-profile';

// TTL de caché de perfil: 24 horas.
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

// Use case que retorna el perfil del usuario por rol.
// Lógica de caché: si el perfil en `ProfileStorage` es fresco (< 24h), lo devuelve sin
// llamar al backend. Si está stale o ausente, lo fetcha y actualiza el caché.
// `nowMs` se inyecta para permitir control del tiempo en tests.
export class GetProfileUseCase {
  constructor(
    private readonly profileStorage: ProfileStorage,
    private readonly authRepo: AuthRepository,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  async execute(role: Role): Promise<StudentProfile | TutorProfile> {
    const cached = await this.profileStorage.read(role);
    if (cached && this.nowMs() - cached.cachedAt < PROFILE_TTL_MS) {
      return cached.profile;
    }
    const profile = await this.authRepo.getProfile(role);
    await this.profileStorage.write(role, profile);
    return profile;
  }
}
