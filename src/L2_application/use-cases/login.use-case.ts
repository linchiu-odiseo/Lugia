import { AuthRepository, Credentials } from '../../L1_domain/ports/auth-repository';
import { SessionStorage } from '../../L1_domain/ports/session-storage';
import { Session } from '../../L1_domain/entities/session';

export class LoginUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly storage: SessionStorage,
  ) {}

  // Si el repo falla (credenciales o red), el storage NO se toca:
  // la sesión previa permanece intacta. Si el repo resuelve, descartamos
  // cualquier sesión previa antes de persistir la nueva (regla de una sola
  // sesión activa simultánea).
  async execute(credentials: Credentials): Promise<Session> {
    const session = await this.repo.login(credentials);
    await this.storage.clear();
    await this.storage.write(session);
    return session;
  }
}
