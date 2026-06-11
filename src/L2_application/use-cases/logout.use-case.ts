import { AuthRepository } from '../../L1_domain/ports/auth-repository';
import { SessionStorage } from '../../L1_domain/ports/session-storage';

export class LogoutUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly storage: SessionStorage,
  ) {}

  // Idempotente: si no hay sesión activa, es no-op.
  // Si la hay, intenta revocarla server-side (best-effort) y SIEMPRE
  // limpia el storage local — aunque el server falle, el usuario queda
  // deslogeado en este dispositivo.
  async execute(): Promise<void> {
    const session = await this.storage.read();
    if (session) {
      try {
        await this.repo.logout(session);
      } catch {
        // best-effort
      }
    }
    await this.storage.clear();
  }
}
