import { Routes } from '@angular/router';
import { authGuard } from '../L3_periphery/guards/auth.guard';
import { publicOnlyGuard } from '../L3_periphery/guards/public-only.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/login' },
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'simulacro/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/simulacro/simulacro.page').then((m) => m.SimulacroPage),
  },
  { path: '**', redirectTo: '/login' },
];
