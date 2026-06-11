import { Session } from '../../L1_domain/entities/session';
import { BearerToken } from '../../L1_domain/value-objects/bearer-token';
import { SessionStorage } from '../../L1_domain/ports/session-storage';

// Cuando el backend devuelve el header `X-New-Bearer` en cualquier respuesta
// autenticada, el interceptor de L3 dispara este use case. La sesión activa
// se reescribe con el nuevo bearer, preservando `userEmail` e `issuedAt`
// (que representa cuándo arrancó la sesión, no cuándo se rotó el bearer).
//
// Comportamiento defensivo:
// - Si el nuevo bearer viene vacío o solo whitespace → no-op (header malformado).
// - Si no hay sesión activa al momento del renew → no-op (race condition raro
//   donde el alumno se desloguea mientras una respuesta in-flight trae bearer).
// - Si la construcción de la nueva `Session` rechaza por invariantes del
//   dominio → propaga el error (caller decide; el interceptor lo ignora con
//   try/catch porque es fire-and-forget).
export class ActualizarBearerSiRenovadoUseCase {
  constructor(private readonly storage: SessionStorage) {}

  async execute(newBearer: string | null | undefined): Promise<void> {
    const trimmed = (newBearer ?? '').trim();
    if (trimmed.length === 0) return;

    const current = await this.storage.read();
    if (!current) return;

    const renewed = new Session(
      new BearerToken(trimmed),
      current.userEmail,
      current.issuedAt,
    );
    await this.storage.write(renewed);
  }
}
