import {
  ApplicationConfig,
  InjectionToken,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './LR_render/app.routes';

// L1 ports — Angular los conoce solo como InjectionTokens declarados aquí
// (mantiene el dominio independiente del framework DI).
import { AuthRepository } from './L1_domain/ports/auth-repository';
import { SessionStorage } from './L1_domain/ports/session-storage';
import { Clock } from './L1_domain/ports/clock';
import { Connectivity } from './L1_domain/ports/connectivity';
import { MarkingsStorage } from './L1_domain/ports/markings-storage';

// L2 use cases — clases TS puras sin @Injectable; las proveemos por factory.
import { LoginUseCase } from './L2_application/use-cases/login.use-case';
import { LogoutUseCase } from './L2_application/use-cases/logout.use-case';
import { GetActiveSessionUseCase } from './L2_application/use-cases/get-active-session.use-case';

// L3 implementaciones de los puertos + el interceptor HTTP único.
import { HttpAuthRepository } from './L3_periphery/http/http-auth-repository';
import { LocalStorageSessionStorage } from './L3_periphery/storage/local-storage-session-storage';
import { IndexedDbMarkingsStorage } from './L3_periphery/storage/indexed-db-markings-storage';
import { ServerAnchoredClock } from './L3_periphery/clock/server-anchored-clock';
import { BrowserConnectivity } from './L3_periphery/connectivity/browser-connectivity';
import { authHeadersInterceptor } from './L3_periphery/interceptors/auth-headers.interceptor';

export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>('AUTH_REPOSITORY');
export const SESSION_STORAGE = new InjectionToken<SessionStorage>('SESSION_STORAGE');
export const CLOCK = new InjectionToken<Clock>('CLOCK');
export const CONNECTIVITY = new InjectionToken<Connectivity>('CONNECTIVITY');
export const MARKINGS_STORAGE = new InjectionToken<MarkingsStorage>('MARKINGS_STORAGE');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authHeadersInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    // Bind puertos L1 → implementaciones L3 (ambas ya son @Injectable root-scoped).
    { provide: AUTH_REPOSITORY, useExisting: HttpAuthRepository },
    { provide: SESSION_STORAGE, useExisting: LocalStorageSessionStorage },
    { provide: CLOCK, useExisting: ServerAnchoredClock },
    { provide: CONNECTIVITY, useExisting: BrowserConnectivity },
    { provide: MARKINGS_STORAGE, useExisting: IndexedDbMarkingsStorage },

    // Use cases L2: pure TS, sin decorador — Angular los instancia vía factory.
    {
      provide: LoginUseCase,
      useFactory: (repo: AuthRepository, storage: SessionStorage) =>
        new LoginUseCase(repo, storage),
      deps: [AUTH_REPOSITORY, SESSION_STORAGE],
    },
    {
      provide: LogoutUseCase,
      useFactory: (
        repo: AuthRepository,
        storage: SessionStorage,
        markings: MarkingsStorage,
      ) => new LogoutUseCase(repo, storage, markings),
      deps: [AUTH_REPOSITORY, SESSION_STORAGE, MARKINGS_STORAGE],
    },
    {
      provide: GetActiveSessionUseCase,
      useFactory: (storage: SessionStorage) => new GetActiveSessionUseCase(storage),
      deps: [SESSION_STORAGE],
    },
  ],
};
