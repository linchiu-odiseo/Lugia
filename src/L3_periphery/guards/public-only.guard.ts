import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { GetActiveSessionUseCase } from '../../L2_application/use-cases/get-active-session.use-case';

// Espejo del authGuard: si YA hay sesión activa, redirige a /home en lugar
// de mostrar el login nuevamente (evita el patrón "login doble").
export const publicOnlyGuard: CanActivateFn = async () => {
  const getSession = inject(GetActiveSessionUseCase);
  const router = inject(Router);
  const session = await getSession.execute();
  if (!session) return true;
  return router.parseUrl('/home');
};
