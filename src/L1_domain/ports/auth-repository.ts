import { Session } from '../entities/session';

export interface Credentials {
  email: string;
  password: string;
}

// Puerto del dominio para autenticación contra el backend.
// Implementación concreta vive en L3 (`HttpAuthRepository`).
// El InjectionToken Angular que mapea a una implementación se declara en `src/app.config.ts`.
export interface AuthRepository {
  login(credentials: Credentials): Promise<Session>;
  logout(session: Session): Promise<void>;
}
