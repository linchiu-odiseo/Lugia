import { BearerToken } from '../value-objects/bearer-token';
import { InvalidSessionError } from '../errors/invalid-session.error';

export class Session {
  public readonly bearerToken: BearerToken;
  public readonly userEmail: string;
  public readonly issuedAt: Date;

  constructor(bearerToken: BearerToken, userEmail: string, issuedAt: Date) {
    if (!(bearerToken instanceof BearerToken)) {
      throw new InvalidSessionError('Session requiere un BearerToken válido.');
    }
    const email = (userEmail ?? '').trim();
    if (email.length === 0 || !email.includes('@')) {
      throw new InvalidSessionError('Session requiere un userEmail con formato válido.');
    }
    if (!(issuedAt instanceof Date) || Number.isNaN(issuedAt.getTime())) {
      throw new InvalidSessionError('Session requiere un issuedAt Date válido.');
    }
    this.bearerToken = bearerToken;
    this.userEmail = email;
    this.issuedAt = issuedAt;
  }

  // Fase 1: los Sanctum tokens de API-FAKE son longevos sin política de expiración server-side.
  // El método existe para preservar el contrato del dominio cuando Fase 2 introduzca TTL real o refresh.
  isExpired(_now: Date): boolean {
    return false;
  }

  principal(): string {
    return this.userEmail;
  }
}
