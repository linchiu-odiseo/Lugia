import { Role } from '../entities/identity';
import { StudentProfile } from '../value-objects/student-profile';
import { TutorProfile } from '../value-objects/tutor-profile';

// Wrapper que incluye el perfil y el timestamp de cuándo fue cacheado.
// La evaluación de TTL queda a cargo de `GetProfileUseCase` (L2).
export interface CachedProfile<
  T extends StudentProfile | TutorProfile = StudentProfile | TutorProfile,
> {
  readonly profile: T;
  readonly cachedAt: number; // timestamp ms
}

// Puerto del dominio para caché de perfiles por rol.
// Implementación concreta: `IndexedDbProfileStorage` en L3.
// `clear()` borra el caché de ambos roles (se invoca en logout).
export interface ProfileStorage {
  read(role: Role): Promise<CachedProfile | null>;
  write(role: Role, profile: StudentProfile | TutorProfile): Promise<void>;
  clear(): Promise<void>;
}
