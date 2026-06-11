import { HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LocalStorageSessionStorage } from '../storage/local-storage-session-storage';
import { ActualizarBearerSiRenovadoUseCase } from '../../L2_application/use-cases/actualizar-bearer-si-renovado.use-case';

const NEW_BEARER_HEADER = 'X-New-Bearer';

// Único punto donde se inyectan `X-API-Key` (siempre que el request vaya a
// API-FAKE) y `Authorization: Bearer <token>` (solo si hay sesión activa).
// Requests a hosts distintos de `environment.apiBaseUrl` pasan sin tocarse
// para que assets del dev server u otras integraciones futuras no expongan
// la api-key ni el bearer.
//
// Sec.2 también extrae `X-New-Bearer` de la respuesta cuando viene, y dispara
// `ActualizarBearerSiRenovadoUseCase` (fire-and-forget) para que el bearer
// rolling de 6h sea silencioso. Errores en el renew no afectan el response
// que ve el caller — la lógica de logout silencioso ante 401 (Fase 1) sigue
// intacta porque el tap no consume ni transforma el error.
export const authHeadersInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const storage = inject(LocalStorageSessionStorage);
  const renewBearer = inject(ActualizarBearerSiRenovadoUseCase);

  return from(storage.read()).pipe(
    switchMap((session) => {
      let headers = req.headers.set('X-API-Key', environment.apiKey);
      if (session) {
        headers = headers.set('Authorization', `Bearer ${session.bearerToken.value}`);
      }
      return next(req.clone({ headers })).pipe(
        tap((event) => {
          if (event.type !== HttpEventType.Response) return;
          const newBearer = event.headers.get(NEW_BEARER_HEADER);
          if (!newBearer) return;
          void renewBearer.execute(newBearer).catch(() => {
            // best-effort: header malformado o race condition de logout.
            // No afecta al caller — el flujo HTTP original sigue.
          });
        }),
      );
    }),
  );
};
