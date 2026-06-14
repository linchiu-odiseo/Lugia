import { AuthRepository } from '../../L1_domain/ports/auth-repository';
import { IdentityStorage } from '../../L1_domain/ports/identity-storage';
import { Identity } from '../../L1_domain/entities/identity';
import { SessionExpiredError } from '../../L1_domain/errors/session-expired.error';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { GetProfileUseCase } from './get-profile.use-case';

// Use case del AppInitializer: valida la sesión al arrancar la app via GET /auth/me.
//
// Casos:
// - me() OK → persiste identity, dispara profile fire-and-forget, devuelve Identity.
// - me() 401 (SessionExpiredError) → limpia IdentityStorage, devuelve null.
// - me() NetworkError → NO toca storage, propaga error (UI muestra pantalla offline).
export class InitializeSessionUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly identityStorage: IdentityStorage,
    private readonly getProfile: GetProfileUseCase,
  ) {}

  async execute(): Promise<Identity | null> {
    try {
      const identity = await this.authRepo.me();
      await this.identityStorage.write(identity);
      // Fire-and-forget: warm up del caché de perfil.
      void this.getProfile.execute(identity.role()).catch(() => undefined);
      return identity;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await this.identityStorage.clear();
        return null;
      }
      if (err instanceof NetworkError) {
        // Offline: no limpiar storage. El caller decide (pantalla offline).
        throw err;
      }
      throw err;
    }
  }
}
