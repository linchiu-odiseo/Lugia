import { InvalidIdentityError } from '../errors/invalid-identity.error';

export type Role = 'student' | 'tutor';
export type Permission = string;

// Entidad de dominio que representa la identidad autenticada del usuario.
// Invariante central: exactamente 1 rol. El constructor lanza `InvalidIdentityError`
// si `roles.length !== 1`. El método `role()` expone el único rol de forma segura.
export class Identity {
  constructor(
    readonly id: string, // UUID del TenantUser
    readonly tenantId: string,
    readonly email: string,
    readonly codigo: string | null, // presente en alumno, null en tutor (learnex actual)
    readonly roles: readonly Role[],
    readonly permissions: readonly Permission[],
    readonly expiresAt: number, // timestamp ms
  ) {
    if (roles.length !== 1) {
      throw new InvalidIdentityError(`Identity requires exactly 1 role; got ${roles.length}`);
    }
  }

  role(): Role {
    return this.roles[0];
  }

  isExpired(now: number): boolean {
    return now >= this.expiresAt;
  }

  shouldRefresh(now: number, thresholdMs = 60_000): boolean {
    return now >= this.expiresAt - thresholdMs;
  }

  hasPermission(perm: Permission): boolean {
    return this.permissions.includes(perm);
  }
}
