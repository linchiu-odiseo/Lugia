import { AuthRepository } from '../../L1_domain/ports/auth-repository';
import { IdentityStorage } from '../../L1_domain/ports/identity-storage';
import { Identity } from '../../L1_domain/entities/identity';
import { GetProfileUseCase } from './get-profile.use-case';

// Use case de login: autentica credenciales, persiste la Identity y dispara
// el fetch de perfil en paralelo (fire-and-forget). Devuelve la Identity.
// Si el repo falla (credenciales inválidas, rate limit, red), el storage NO
// se toca: la identity previa permanece intacta.
export class LoginUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly identityStorage: IdentityStorage,
    private readonly getProfile: GetProfileUseCase,
  ) {}

  async execute(credentials: { email: string; password: string }): Promise<Identity> {
    const identity = await this.authRepo.login(credentials);
    await this.identityStorage.write(identity);
    // Fire-and-forget: no bloquea el retorno del use case.
    void this.getProfile.execute(identity.role()).catch((err) => {
      console.warn('profile fetch post-login failed', err);
    });
    return identity;
  }
}
