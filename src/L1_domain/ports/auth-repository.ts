import { Identity, Role } from '../entities/identity';
import { StudentProfile } from '../value-objects/student-profile';
import { TutorProfile } from '../value-objects/tutor-profile';

// Puerto del dominio para autenticación contra el backend learnex.
// Implementación concreta vive en L3 (`HttpAuthRepository`).
// Clasificación de errores HTTP por (status, endpoint, code) — nunca por message.
export interface AuthRepository {
  login(credentials: { email: string; password: string }): Promise<Identity>;
  me(): Promise<Identity>;
  refresh(): Promise<Identity>;
  logout(): Promise<void>;
  getProfile(role: Role): Promise<StudentProfile | TutorProfile>;
}
