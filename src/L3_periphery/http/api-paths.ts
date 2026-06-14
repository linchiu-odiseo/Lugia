import { environment } from '../../environments/environment';

// Único punto de interpolación del tenant slug en URLs de learnex.
// La regla: ningún adapter L3 concatena `/t/<slug>/...` directamente — todo
// pasa por este helper. Cambiar `TENANT_SLUG` en `.env` cambia todas las
// URLs sin tocar código fuente.
//
// Las rutas siguen el contrato de learnex (.authentic/pwa-auth-contract.md):
//   POST /t/{slug}/auth/login
//   POST /t/{slug}/auth/refresh
//   POST /t/{slug}/auth/logout
//   GET  /t/{slug}/auth/me
//   GET  /t/{slug}/{role}/me
function base(): string {
  return `${environment.apiBaseUrl}/t/${environment.tenantSlug}`;
}

export const apiPath = {
  login: (): string => `${base()}/auth/login`,
  refresh: (): string => `${base()}/auth/refresh`,
  logout: (): string => `${base()}/auth/logout`,
  me: (): string => `${base()}/auth/me`,
  profile: (role: 'student' | 'tutor'): string => `${base()}/${role}/me`,
};
