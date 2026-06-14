import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Role } from '../../L1_domain/entities/identity';
import { GetIdentityUseCase } from '../../L2_application/use-cases/get-identity.use-case';

// Factory functional para guards de rutas namespaced por rol.
// Uso típico en `app.routes.ts`:
//   { path: 'student', canActivate: [authGuard, roleGuard('student')], ... }
//   { path: 'tutor',   canActivate: [authGuard, roleGuard('tutor')],   ... }
//
// Si no hay identity → redirect a `/login` (delegado al authGuard cuando
// se encadenan, pero defensivo si se usa standalone).
// Si la identity tiene un rol distinto al esperado → redirect al home
// del rol real (no /login). Esto evita el patrón "tutor click en
// deep-link de alumno → pantalla de login confusa".
export function roleGuard(expectedRole: Role): CanActivateFn {
  return async () => {
    const getIdentity = inject(GetIdentityUseCase);
    const router = inject(Router);
    const identity = await getIdentity.execute();
    if (!identity) return router.parseUrl('/login');
    if (identity.role() === expectedRole) return true;
    return router.parseUrl(`/${identity.role()}/home`);
  };
}
