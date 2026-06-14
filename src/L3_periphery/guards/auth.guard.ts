import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { GetIdentityUseCase } from '../../L2_application/use-cases/get-identity.use-case';

// Bloquea el acceso a rutas marcadas si no hay identity activa.
// Consulta la identity vía el use case (NO toca IdentityStorage directo)
// para preservar el aislamiento de capas y permitir testear con un doble.
//
// Si la identity está expirada (`isExpired`), `GetIdentityUseCase` ya
// devuelve null — no hace falta verificar acá. El interceptor de auth se
// encargará de refrescar si todavía hay refresh-cookie viva.
export const authGuard: CanActivateFn = async () => {
  const getIdentity = inject(GetIdentityUseCase);
  const router = inject(Router);
  const identity = await getIdentity.execute();
  if (identity) return true;
  return router.parseUrl('/login');
};
