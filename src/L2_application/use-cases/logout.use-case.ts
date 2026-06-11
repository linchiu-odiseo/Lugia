import { AuthRepository } from '../../L1_domain/ports/auth-repository';
import { SessionStorage } from '../../L1_domain/ports/session-storage';
import { MarkingsStorage } from '../../L1_domain/ports/markings-storage';

export class LogoutUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly storage: SessionStorage,
    private readonly markings: MarkingsStorage,
  ) {}

  // Idempotente: si no hay sesión activa, es no-op.
  // Si la hay: borra primero las marcaciones locales del usuario actual
  // (necesita la sesión viva para derivar el scope), luego intenta
  // revocarla server-side (best-effort), y SIEMPRE limpia el storage de
  // sesión. Errores de wipe o logout NO bloquean el flujo — el usuario
  // queda deslogueado localmente sí o sí.
  async execute(): Promise<void> {
    const session = await this.storage.read();
    if (session) {
      try {
        await this.markings.wipeUserScope();
      } catch {
        // best-effort: si el IDB falla, no podemos hacer mucho mas — el
        // borrado de sesion abajo igual deja al usuario fuera.
      }
      try {
        await this.repo.logout(session);
      } catch {
        // best-effort
      }
    }
    await this.storage.clear();
  }
}
