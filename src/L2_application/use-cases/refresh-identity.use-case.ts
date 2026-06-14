import { AuthRepository } from '../../L1_domain/ports/auth-repository';
import { IdentityStorage } from '../../L1_domain/ports/identity-storage';
import { Identity } from '../../L1_domain/entities/identity';
import { RefreshFailedError } from '../../L1_domain/errors/refresh-failed.error';
import { LogoutUseCase } from './logout.use-case';

// Use case que refresca la identity del usuario via POST /auth/refresh.
// Si el refresh falla con `RefreshFailedError` (token inválido/expirado),
// invoca `LogoutUseCase` para limpiar el estado local y redirigir a /login.
// El `LogoutUseCase` se inyecta directamente (no hay ciclo en L2 puro;
// el ciclo Angular DI se rompe vía InjectionTokens en app.tokens.ts — L3/PR2).
export class RefreshIdentityUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly identityStorage: IdentityStorage,
    private readonly logout: LogoutUseCase,
  ) {}

  async execute(): Promise<Identity> {
    try {
      const identity = await this.authRepo.refresh();
      await this.identityStorage.write(identity);
      return identity;
    } catch (err) {
      if (err instanceof RefreshFailedError) {
        await this.logout.execute();
      }
      throw err;
    }
  }
}
