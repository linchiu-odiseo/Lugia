import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LocalStorageSessionStorage } from '../storage/local-storage-session-storage';

// Único punto donde se inyectan `X-API-Key` (siempre que el request vaya a
// API-FAKE) y `Authorization: Bearer <token>` (solo si hay sesión activa).
// Requests a hosts distintos de `environment.apiBaseUrl` pasan sin tocarse
// para que assets del dev server u otras integraciones futuras no expongan
// la api-key ni el bearer.
export const authHeadersInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const storage = inject(LocalStorageSessionStorage);

  return from(storage.read()).pipe(
    switchMap((session) => {
      let headers = req.headers.set('X-API-Key', environment.apiKey);
      if (session) {
        headers = headers.set('Authorization', `Bearer ${session.bearerToken.value}`);
      }
      return next(req.clone({ headers }));
    }),
  );
};
