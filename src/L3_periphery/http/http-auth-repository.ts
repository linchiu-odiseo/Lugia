import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthRepository, Credentials } from '../../L1_domain/ports/auth-repository';
import { Session } from '../../L1_domain/entities/session';
import { BearerToken } from '../../L1_domain/value-objects/bearer-token';
import { InvalidCredentialsError } from '../../L1_domain/errors/invalid-credentials.error';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { environment } from '../../environments/environment';

interface LoginResponseDto {
  token: string;
  user: { email: string; name: string };
}

@Injectable({ providedIn: 'root' })
export class HttpAuthRepository implements AuthRepository {
  private readonly http = inject(HttpClient);

  async login(credentials: Credentials): Promise<Session> {
    try {
      const dto = await firstValueFrom(
        this.http.post<LoginResponseDto>(`${environment.apiBaseUrl}/auth/login`, credentials),
      );
      return new Session(new BearerToken(dto.token), dto.user.email, new Date());
    } catch (err) {
      throw this.classifyLoginError(err);
    }
  }

  async logout(_session: Session): Promise<void> {
    // Best-effort: el LogoutUseCase ya envuelve la llamada en try/catch.
    // Aun así, si el server responde error, propagamos para que el caller
    // pueda loguear si lo desea — pero no clasificamos: cualquier fallo
    // server-side de logout es benigno mientras el storage local se limpie.
    await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/auth/logout`, {}));
  }

  // Clasifica errores HTTP por (status, endpoint), NUNCA por el `message` del body.
  // API-FAKE usa al menos 3 strings distintos para 401 y pueden cambiar sin aviso.
  private classifyLoginError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return new InvalidCredentialsError();
      if (err.status === 0 || err.status >= 500) return new NetworkError();
    }
    return new NetworkError();
  }
}
