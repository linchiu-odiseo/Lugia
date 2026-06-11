import {
  ApplicationConfig,
  InjectionToken,
  inject,
  isDevMode,
  provideAppInitializer,
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
import { SimulacrosApi } from './L1_domain/ports/simulacros-api';

// L2 use cases — clases TS puras sin @Injectable; las proveemos por factory.
import { LoginUseCase } from './L2_application/use-cases/login.use-case';
import { LogoutUseCase } from './L2_application/use-cases/logout.use-case';
import { GetActiveSessionUseCase } from './L2_application/use-cases/get-active-session.use-case';
import { ActualizarBearerSiRenovadoUseCase } from './L2_application/use-cases/actualizar-bearer-si-renovado.use-case';
import { ObtenerSimulacrosDelDiaUseCase } from './L2_application/use-cases/obtener-simulacros-del-dia.use-case';
import { MarcarRespuestaUseCase } from './L2_application/use-cases/marcar-respuesta.use-case';
import { EnviarSimulacroUseCase } from './L2_application/use-cases/enviar-simulacro.use-case';
import { RetomarEnviosPendientesUseCase } from './L2_application/use-cases/retomar-envios-pendientes.use-case';
import { ProgramarAutoEnvioUseCase } from './L2_application/use-cases/programar-auto-envio.use-case';

// L3 implementaciones de los puertos + el interceptor HTTP único.
import { HttpAuthRepository } from './L3_periphery/http/http-auth-repository';
import { HttpSimulacrosApi } from './L3_periphery/http/http-simulacros-api';
import { LocalStorageSessionStorage } from './L3_periphery/storage/local-storage-session-storage';
import { IndexedDbMarkingsStorage } from './L3_periphery/storage/indexed-db-markings-storage';
import { ServerAnchoredClock } from './L3_periphery/clock/server-anchored-clock';
import { BrowserConnectivity } from './L3_periphery/connectivity/browser-connectivity';
import { EnvioRetryDispatcher } from './L3_periphery/envio/envio-retry-dispatcher.service';
import { authHeadersInterceptor } from './L3_periphery/interceptors/auth-headers.interceptor';

export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>('AUTH_REPOSITORY');
export const SESSION_STORAGE = new InjectionToken<SessionStorage>('SESSION_STORAGE');
export const CLOCK = new InjectionToken<Clock>('CLOCK');
export const CONNECTIVITY = new InjectionToken<Connectivity>('CONNECTIVITY');
export const MARKINGS_STORAGE = new InjectionToken<MarkingsStorage>('MARKINGS_STORAGE');
export const SIMULACROS_API = new InjectionToken<SimulacrosApi>('SIMULACROS_API');

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
    { provide: SIMULACROS_API, useExisting: HttpSimulacrosApi },

    // Use cases L2: pure TS, sin decorador — Angular los instancia vía factory.
    {
      provide: LoginUseCase,
      useFactory: (repo: AuthRepository, storage: SessionStorage) =>
        new LoginUseCase(repo, storage),
      deps: [AUTH_REPOSITORY, SESSION_STORAGE],
    },
    {
      provide: LogoutUseCase,
      useFactory: (repo: AuthRepository, storage: SessionStorage, markings: MarkingsStorage) =>
        new LogoutUseCase(repo, storage, markings),
      deps: [AUTH_REPOSITORY, SESSION_STORAGE, MARKINGS_STORAGE],
    },
    {
      provide: GetActiveSessionUseCase,
      useFactory: (storage: SessionStorage) => new GetActiveSessionUseCase(storage),
      deps: [SESSION_STORAGE],
    },
    {
      provide: ActualizarBearerSiRenovadoUseCase,
      useFactory: (storage: SessionStorage) => new ActualizarBearerSiRenovadoUseCase(storage),
      deps: [SESSION_STORAGE],
    },
    {
      provide: ObtenerSimulacrosDelDiaUseCase,
      useFactory: (api: SimulacrosApi, clock: Clock) =>
        new ObtenerSimulacrosDelDiaUseCase(api, clock),
      deps: [SIMULACROS_API, CLOCK],
    },
    {
      provide: MarcarRespuestaUseCase,
      useFactory: (markings: MarkingsStorage) => new MarcarRespuestaUseCase(markings),
      deps: [MARKINGS_STORAGE],
    },
    {
      provide: EnviarSimulacroUseCase,
      useFactory: (api: SimulacrosApi, markings: MarkingsStorage, clock: Clock) =>
        new EnviarSimulacroUseCase(api, markings, clock),
      deps: [SIMULACROS_API, MARKINGS_STORAGE, CLOCK],
    },
    {
      provide: RetomarEnviosPendientesUseCase,
      useFactory: (api: SimulacrosApi, markings: MarkingsStorage) =>
        new RetomarEnviosPendientesUseCase(api, markings),
      deps: [SIMULACROS_API, MARKINGS_STORAGE],
    },
    {
      provide: ProgramarAutoEnvioUseCase,
      useFactory: (enviar: EnviarSimulacroUseCase, clock: Clock) =>
        new ProgramarAutoEnvioUseCase(enviar, clock),
      deps: [EnviarSimulacroUseCase, CLOCK],
    },

    // Bootstrap del dispatcher de retomar envíos: al arrancar la app intenta
    // despachar la cola si hay red, y queda suscrito a Connectivity para
    // futuros retries automáticos.
    provideAppInitializer(() => {
      inject(EnvioRetryDispatcher).start();
    }),
  ],
};
