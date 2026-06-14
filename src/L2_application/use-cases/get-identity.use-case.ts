import { IdentityStorage } from '../../L1_domain/ports/identity-storage';
import { Identity } from '../../L1_domain/entities/identity';

// Use case que devuelve la Identity activa del storage si existe y no está expirada.
// Devuelve null si el storage está vacío o si la identity está expirada.
// `nowMs` se inyecta para permitir control del tiempo en tests.
// (Renombrado de `GetActiveSessionUseCase` de Fase 2.)
export class GetIdentityUseCase {
  constructor(
    private readonly identityStorage: IdentityStorage,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  async execute(): Promise<Identity | null> {
    const identity = await this.identityStorage.read();
    if (!identity) return null;
    if (identity.isExpired(this.nowMs())) {
      // Identity expirada — el próximo request 401 dispara refresh reactivo en el interceptor.
      return null;
    }
    return identity;
  }
}
