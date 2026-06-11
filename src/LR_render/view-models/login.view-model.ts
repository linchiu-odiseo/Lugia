import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LoginUseCase } from '../../L2_application/use-cases/login.use-case';
import { Credentials } from '../../L1_domain/ports/auth-repository';
import { InvalidCredentialsError } from '../../L1_domain/errors/invalid-credentials.error';
import { NetworkError } from '../../L1_domain/errors/network.error';

export type SubmitOutcome = 'ok' | 'invalid' | 'network';

@Injectable()
export class LoginViewModel {
  private readonly login = inject(LoginUseCase);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  async submit(credentials: Credentials): Promise<SubmitOutcome> {
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.login.execute(credentials);
      await this.router.navigate(['/home']);
      return 'ok';
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        this.errorMessage.set('Credenciales inválidas');
        return 'invalid';
      }
      if (err instanceof NetworkError) {
        this.errorMessage.set('No se pudo conectar al servidor. Inténtalo de nuevo.');
        return 'network';
      }
      // Bug del programador (no es InvalidCredentials ni Network).
      // Re-lanzamos para que se vea en consola y no quede silenciado.
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
