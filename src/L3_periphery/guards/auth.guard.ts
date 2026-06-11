import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { GetActiveSessionUseCase } from '../../L2_application/use-cases/get-active-session.use-case';

// Bloquea el acceso a rutas marcadas si no hay sesión activa.
// Consulta la sesión vía el use case (NO toca SessionStorage directo)
// para preservar el aislamiento de capas y permitir testear con un doble.
export const authGuard: CanActivateFn = async () => {
  const getSession = inject(GetActiveSessionUseCase);
  const router = inject(Router);
  const session = await getSession.execute();
  if (session) return true;
  return router.parseUrl('/login');
};
