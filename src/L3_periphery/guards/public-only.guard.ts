import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { GetIdentityUseCase } from '../../L2_application/use-cases/get-identity.use-case';

// Espejo del authGuard: si YA hay identity activa, redirige al home del
// rol correspondiente (`/student/home` o `/tutor/home`) en lugar de
// mostrar el login nuevamente.
//
// El rol viene del invariante single-role de Identity — no hay
// ambigüedad. Si por algún bug la identity tuviera más/menos roles,
// el constructor de Identity ya lanzaría InvalidIdentityError antes
// de llegar acá.
export const publicOnlyGuard: CanActivateFn = async () => {
  const getIdentity = inject(GetIdentityUseCase);
  const router = inject(Router);
  const identity = await getIdentity.execute();
  if (!identity) return true;
  return router.parseUrl(`/${identity.role()}/home`);
};
