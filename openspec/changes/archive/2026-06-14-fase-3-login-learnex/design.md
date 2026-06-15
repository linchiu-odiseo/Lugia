## Context

Fase 3 abre con un cut-over duro de auth: API-FAKE (Sanctum bearer + `X-API-Key`) sale, learnex (cookies HttpOnly + `withCredentials` + multi-rol mínimo) entra. El proposal ya estableció el "por qué" (deuda de mantener dos backends, contrato learnex verificado al 2026-06-13) y los specs el "qué" (Identity, profiles separados por rol, interceptor de credenciales con refresh reactivo, routing por rol). Este documento define el "cómo": shapes TypeScript exactos, pseudocódigo de los puntos críticos, orden resuelto del logout, slicing de PRs y plan de tests.

La trampa principal de la implementación: **(a)** las cookies son invisibles a JS y el SW — toda la lógica de auth vive en main thread y se valida por el efecto observable del 401; **(b)** el cut-over es duro, sin feature flag, así que la cartilla queda rota en runtime hasta `fase-3-exam-learnex`; **(c)** ~75 archivos de test se tocan (delete + rewrite + new), y la única forma de no caer en "big bang" es la cadena L1 → L2 → L3 → LR validando verde antes de avanzar.

Restricciones que no se mueven:
- Hexagonal estricta L1/L2/L3/LR (ESLint enforza imports, `hexagonal-guard` audita el resto).
- L1 + L2 son TypeScript puro (cero `@angular/*`, cero `rxjs`, cero browser APIs).
- Strings UI en es-PE hardcoded.
- Clasificación de errores HTTP por `(status, endpoint, code)` — `message` queda prohibido.
- Slug `vonex` nunca aparece en código fuente bajo `src/` — siempre vía `environment.tenantSlug`.

## Goals / Non-Goals

**Goals:**
- Sustituir Sanctum bearer + `X-API-Key` por cookies HttpOnly + `withCredentials: true` global vía un único interceptor `credentialsInterceptor`.
- Modelar la identidad del usuario como `Identity` en L1 con invariante single-role, expiración explícita, permisos lookup.
- Cachear los perfiles en `IndexedDbProfileStorage` con TTL 24h e invalidación dura en logout.
- Routing con prefijo de rol (`/student/*`, `/tutor/*`) con redirects legacy desde `/home` y `/simulacro/:id` para no romper bookmarks.
- AppInitializer que llama `/auth/me` al arrancar y resuelve el navigate inicial (`/{role}/home` | `/login` | pantalla offline).
- Fijar el plan de slicing en 3 PRs encadenadas para que cada layer pase CI verde antes de avanzar.

**Non-Goals:**
- Pre-emptive refresh timer (postergado hasta acordar TTL JWT con learnex).
- Migración del `lugia.session` legacy (descartado a propósito).
- Tutor flow real (aulas, dashboard, activación de examen) — solo stub identificable.
- Multi-rol switcher (invariante single-role).
- Endpoints de examen learnex — los cubre `fase-3-exam-learnex`.
- CORS allowlist prod, multi-tenant runtime — open questions documentadas.
- I18n del back (`code` cubre clasificación; `message` sigue prohibido).

## Diagrama de flujo del nuevo auth

### Boot (AppInitializer)

```
app.config.ts → provideAppInitializer
        │
        ▼
InitializeSessionUseCase.execute()
        │
        ├──▶ AuthRepository.me()  ──▶ GET /t/{slug}/auth/me  (cookies van solas)
        │           │
        │           ├─ 200 OK ─▶ Identity ─▶ IdentityStorage.write
        │           │                    │
        │           │                    ├─▶ GetProfileUseCase (fire-and-forget)
        │           │                    │
        │           │                    └─▶ Router.navigate(`/${role}/home`)
        │           │
        │           ├─ 401 ─▶ SessionExpiredError ─▶ IdentityStorage.clear
        │           │                            │
        │           │                            └─▶ Router.navigate('/login')
        │           │
        │           └─ NetworkError ─▶ propaga sin limpiar storage
        │                            │
        │                            └─▶ UI muestra pantalla offline
```

### Login

```
LoginPage  →  LoginViewModel.submit()  →  LoginUseCase.execute({email, password})
                                                │
                                                ▼
                              AuthRepository.login() ─▶ POST /t/{slug}/auth/login
                                                │           (withCredentials: true)
                                                │
                                                ├─ 200 ─▶ Set-Cookie HttpOnly
                                                │     │   body: {user, expiresAt}
                                                │     │
                                                │     ├─▶ Identity construido
                                                │     ├─▶ IdentityStorage.write
                                                │     └─▶ GetProfileUseCase (fire-and-forget)
                                                │
                                                ├─ 401 code=TENANT_AUTH_INVALID_CREDENTIALS
                                                │   ▶ InvalidCredentialsError
                                                │
                                                └─ 429 ─▶ RateLimitError
                                                │
                                                ▼
                          LoginViewModel resuelve ─▶ Router.navigate(`/${identity.role()}/home`)
```

### Protected request (con 401 inesperado en endpoint protegido)

```
componente / use case  →  HttpClient.<verb>(url)
                                │
                                ▼
                  credentialsInterceptor
                  - if url.startsWith(apiBaseUrl): clone({withCredentials: true})
                                │
                                ▼
                       next(cloned) ─▶ GET /t/{slug}/student/me
                                │
                  ┌─────────────┴──────────────┐
                  │                            │
                  ▼                            ▼
              200 OK                       401 (NO en /auth/*)
                  │                            │
                  └─▶ caller                   ▼
                              ensureRefreshed() (lock shareReplay(1))
                                  │
                                  ├─▶ POST /t/{slug}/auth/refresh
                                  │       │
                                  │   ┌───┴────┐
                                  │   │        │
                                  │  200      401 code=TENANT_AUTH_REFRESH_*
                                  │   │        │
                                  │   ▼        ▼
                                  │ retry   RefreshFailedError
                                  │ next(   │
                                  │  cloned)▼
                                  │   │   LogoutUseCase.execute() (fire-and-forget)
                                  │   ▼   │
                                  │ caller ▼
                                  │       Router.navigate('/login')
```

### Logout

```
Page.onLogout()  →  LogoutUseCase.execute()

  1) email = (await IdentityStorage.read())?.email      ← capturar antes de limpiar
  2) try { await AuthRepo.logout() } catch { warn; continue }  ← best-effort
  3) await MarkingsStorage.wipeUserScope(email)         ← requiere email
  4) await OutboxStorage.clear()
  5) await ProfileStorage.clear()
  6) await IdentityStorage.clear()
  7) swMessenger.post({type: 'LOGOUT'})                  ← opcional
  8) Router.navigate('/login')
```

## Decisions (ADR-style)

### D1: `Identity` como entidad rica de L1 con invariante single-role

**Decisión.** `Identity` es una clase TS pura con campos readonly y métodos de comportamiento. El constructor valida que `roles.length === 1`; si no, lanza `InvalidIdentityError`. El método `role()` devuelve el único elemento.

**Por qué.**
- El back de learnex (verificado contra contrato del 2026-06-13) garantiza 1 rol por user en este producto. Codificar la invariante en el constructor falla rápido si el contrato cambia.
- Una entidad rica evita que el routing, los guards y los view-models tengan que pickar el rol con `roles[0]` defensivo en cada llamada.
- `isExpired`, `shouldRefresh`, `hasPermission` mantienen al view-model y al guard libres de aritmética temporal o lookups manuales.

**Alternativa descartada.** Type alias `Identity = { ... }` sin clase. Más liviano pero (a) deja la invariante single-role en cada call site, (b) imposibilita el `throw` desde el constructor, (c) rompe el patrón de "entidades ricas" que el resto del dominio ya usa (`Simulacro`, `Marcacion`).

### D2: Refresh reactivo only, lock módulo-level `shareReplay(1)`

**Decisión.** Sin pre-emptive timer. El interceptor reacciona al 401 en endpoint protegido y dispara `ensureRefreshed()`, que serializa todas las llamadas concurrentes vía un `Observable` compartido con `shareReplay(1)` + `finalize` que limpia el lock al terminar.

**Por qué.**
- TTL del JWT (15m) es decisión de learnex y aún está abierta. Implementar pre-emptive timer ahora requiere asumir una ventana que puede cambiar.
- 20k alumnos durante un examen pueden generar requests concurrentes que recibirían 401 simultáneo. Sin lock → N refreshes paralelos = tormenta. El lock con `shareReplay(1)` garantiza que los N suscriptores reciban el resultado del único refresh.
- `finalize` resetea el lock para que el próximo ciclo (cuando el access vuelva a expirar) pueda refrescar de nuevo.

**Alternativa descartada (A).** Pre-emptive timer con `setTimeout(expiresAt - 60s)`. Más anticipatorio pero (a) suma complejidad (cleanup en logout, cancel al cambiar tab, etc.), (b) no elimina la necesidad del lock reactivo, (c) requiere acordar TTL.

**Alternativa descartada (B).** Lock global por `Promise` en vez de `Observable`. Funciona pero mezcla paradigmas con el resto del interceptor que ya es Observable-based.

### D3: Path builder L3 — un solo punto de string interpolation del slug

**Decisión.** Helper `apiPath` en `src/L3_periphery/http/api-paths.ts` exporta funciones tipo `apiPath.login()`, `apiPath.profile(role)`. Todos los adapters L3 consumen el helper. Ningún literal `"vonex"` aparece en `src/`.

**Por qué.**
- Multi-build = un tenant. El slug viene de `environment.tenantSlug`. Si está hardcoded en 5 lugares y cambiamos el slug, hay 5 lugares que rotar.
- La regla `grep -r "vonex" src/ → 0 matches` del spec es enforceable solo si pasa por un solo punto.
- Un cambio futuro a multi-tenant runtime (resolver slug por hostname) toca solo el helper.

**Alternativa descartada.** Constante `environment.tenantPrefix = '/t/vonex'`. Más simple pero deja string-concat con riesgo de duplicar la `/`, y al pasar a runtime hay que reescribir todos los call sites.

### D4: Logout — orden estricto con email capturado antes de limpiar

**Decisión.** Ver pseudocódigo en la sección "Diagrama de flujo → Logout" y la sección "Resolución de risks → Risk #1". El email se lee de `IdentityStorage` ANTES de cualquier `clear()`. `wipeUserScope(email)` recibe el email explícitamente.

**Por qué.**
- `IndexedDbMarkingsStorage` actualmente scopea por email para que dos alumnos en el mismo device no contaminen sus marcaciones. Sin email no sabe qué borrar.
- Limpiar `IdentityStorage` antes que `MarkingsStorage.wipeUserScope` rompería la cadena (no quedaría email para pasar). El orden importa.

**Alternativa descartada.** `wipeUserScope()` sin argumento — lee `IdentityStorage` por su cuenta vía DI. Más acoplado: el adapter de markings necesita conocer el port de identity (que ya está bien por el fix de layer violation), pero forzar el orden de llamada desde el use case es más explícito y testeable.

### D5: `repo.logout()` es best-effort — fallo no bloquea la limpieza local

**Decisión.** Ver pseudocódigo en "Resolución de risks → Risk #2". Si `POST /auth/logout` falla con NetworkError o 5xx, capturamos el error con `console.warn`, no abortamos. Los pasos 3-8 se ejecutan SIEMPRE.

**Por qué.**
- Caso real: alumno cierra sesión con WiFi caído. Si no limpiamos local, otro alumno que abra el celular ve la sesión "fantasma" en `IdentityStorage` hasta el próximo `/auth/me` que devolverá 401, pero entre tanto la home muestra datos del anterior.
- La cookie HttpOnly server-side puede quedar viva. El server la limpia cuando el alumno vuelve a tener red (en el próximo `/auth/refresh` fallido) o por TTL. El riesgo de "sesión server-side huérfana 7 días" es aceptable: el access expira en 15m y sin refresh válido nada se puede hacer.

**Alternativa descartada.** Bloquear el logout local si el server no responde. Sacrifica UX (alumno queda atrapado en `/student/home`) por una garantía de consistencia que el server ya tiene por TTL.

### D6: Redirect raíz `/` queda como está — `'': redirectTo: '/login'`

**Decisión.** No tocar el redirect actual de `'': pathMatch: 'full', redirectTo: '/login'`. El AppInitializer ya cubre el caso "tengo cookie válida y aterricé en `/login`" porque dispara navigate a `/{role}/home` antes del primer render. Para el caso "no tengo cookie" el navigate inicial ya es a `/login`.

**Por qué.**
- Cambiar a `'': redirectTo: '/home'` añade una hop extra (`/` → `/home` → `/{role}/home`) sin ganancia funcional.
- El `publicOnlyGuard` en `/login` ya redirige a `/{role}/home` si hay identity (spec route-protection).
- Mantener el redirect actual minimiza el footprint del cambio de routing y evita romper deep-links cacheados en el SW.

**Alternativa descartada.** `'': redirectTo: '/home'` para reutilizar el redirect legacy. Funciona pero da una doble hop. Sin valor.

### D7: Profile cache con TTL 24h en IndexedDB — no por LocalStorage

**Decisión.** `ProfileStorage` (port L1) implementado por `IndexedDbProfileStorage` (L3), no por LocalStorage. Stores separados `profile.student` y `profile.tutor`.

**Por qué.**
- `TutorProfile.classrooms` puede crecer (un tutor con 10+ aulas). LocalStorage tiene límite de ~5MB compartido con `lugia.identity` y `outbox`. IndexedDB no.
- IndexedDB ya está bootstrapped en el proyecto para markings + outbox. Reusar la infraestructura.
- El TTL se evalúa en el use case (`GetProfileUseCase`), no en el storage. El storage devuelve `null` si stale, esto deja el storage tonto y la lógica de TTL testeable sin tocar IDB.

**Alternativa descartada.** Una sola entrada en LocalStorage con clave `lugia.profile`. Más simple pero (a) puede pegar contra el límite con tutores grandes, (b) no aprovecha la infra IDB ya montada, (c) requiere serializar/deserializar el profile en cada lectura.

### D8: AppInitializer offline-tolerante — `NetworkError` no limpia storage

**Decisión.** Si `repo.me()` falla con `NetworkError`, `InitializeSessionUseCase` propaga el error y NO toca `IdentityStorage`. El `bootstrap` (app.config) atrapa el error y la UI muestra una pantalla genérica de error/offline.

**Por qué.**
- Caso típico: PWA instalada se abre sin red. La identity local sigue siendo válida (cookie HttpOnly aún no expiró). Si limpiamos por error de red, forzamos un re-login innecesario.
- Si el storage queda, una segunda navegación (cuando vuelve la red) re-dispara `/auth/me` y resuelve correctamente.
- 401 vs NetworkError es la distinción crítica que la tabla de clasificación de errores HTTP cubre.

**Alternativa descartada.** "En duda, limpiar storage". Más seguro pero rompe la UX offline-tolerante que el SW supone.

## Resolución de los 3 risks abiertos en spec phase

### Risk #1 — Logout: orden de limpieza con email disponible

`MarkingsStorage.wipeUserScope(email)` necesita el email del usuario activo, que vive en `Identity.email` dentro de `IdentityStorage`. El orden de pasos en `LogoutUseCase` debe capturar el email antes de cualquier limpieza:

```ts
// L2_application/use-cases/logout.use-case.ts
async execute(): Promise<void> {
  const identity = await this.identityStorage.read();
  const email = identity?.email ?? null;

  // 1) Best-effort: avisar al server (ver Risk #2).
  try {
    await this.authRepository.logout();
  } catch (err) {
    console.warn('logout endpoint failed; local cleanup continues', err);
  }

  // 2) Limpiar markings scopeadas por email (no-op si email es null).
  if (email) {
    await this.markingsStorage.wipeUserScope(email);
  }

  // 3) Outbox de envíos pendientes (no scopeada por email — siempre se borra).
  await this.outboxStorage.clear();

  // 4) Profile cache (ambos roles).
  await this.profileStorage.clear();

  // 5) Identity (último, así el resto del flow ya leyó el email).
  await this.identityStorage.clear();

  // 6) SW notification — informativo, no bloqueante.
  this.swMessenger?.post({ type: 'LOGOUT' });

  // 7) Navigate.
  this.router.navigate(['/login']);
}
```

Notas:
- Si `email` es `null` (storage vacío al momento del logout), `wipeUserScope` no se invoca — coincide con el scenario "Logout idempotente — sin sesión activa" del spec `auth-session`.
- El `swMessenger` es opcional. Si en el futuro el SW maneja invalidación de cache, se conecta acá. Por ahora puede ser un no-op.

### Risk #2 — Logout: error en `repo.logout()` (red caída)

`AuthRepository.logout()` ES best-effort. Si falla, capturamos y seguimos. Razón: el cliente DEBE limpiar local para no exponer datos del user anterior, y el server limpia su side por TTL o el próximo intento. Pseudocódigo: ver bloque arriba en Risk #1, paso (1).

Cobertura por scenarios del spec:
- `Scenario: Logout exitoso — limpieza completa` → caso happy path.
- `Scenario: Logout idempotente — sin sesión activa` → `email === null`, salteamos `wipeUserScope`.
- `Scenario: Fallo en llamada al back durante logout no bloquea la limpieza local` → el `try/catch` cubre.

### Risk #3 — Redirect desde `/` raíz

Estado actual en `src/LR_render/app.routes.ts` línea 6: `{ path: '', pathMatch: 'full', redirectTo: '/login' }`.

**Decisión.** Mantener el redirect actual (`'': redirectTo: '/login'`). Razones detalladas en D6. Concretamente:

- `AppInitializer` corre antes del primer render. Si hay identity válida, dispara `Router.navigate('/${role}/home')` que reemplaza el destino. Si no hay identity, queda en `/login`.
- `publicOnlyGuard` en `/login` también redirige a `/{role}/home` si hay identity, así que el caso "identity restaurada después del AppInitializer pero el navigate llegó tarde" igual se cubre.
- El spec `route-protection` explícitamente saca el redirect raíz del scope (`Requirement ELIMINADO: La raíz / redirige según el estado de sesión` → "El redirect desde / queda fuera del scope de este change... No se especifica en este delta").

Por tanto: **NO se modifica `'': redirectTo: '/login'`**. Las rutas legacy `/home` y `/simulacro/:id` SÍ se modifican según el spec.

## Modelo TypeScript — firmas

### L1 — entidad `Identity` y errores

```ts
// src/L1_domain/entities/identity.ts
import { InvalidIdentityError } from '../errors/invalid-identity.error';

export type Role = 'student' | 'tutor';
export type Permission = string;

export class Identity {
  constructor(
    readonly id: string, // TenantUser.id
    readonly tenantId: string,
    readonly email: string,
    readonly codigo: string | null,
    readonly roles: ReadonlyArray<Role>,
    readonly permissions: ReadonlyArray<Permission>,
    readonly expiresAt: number, // ms timestamp
  ) {
    if (roles.length !== 1) {
      throw new InvalidIdentityError(
        `Identity requires exactly 1 role; got ${roles.length}`,
      );
    }
  }

  role(): Role {
    return this.roles[0];
  }

  isExpired(now: number): boolean {
    return now >= this.expiresAt;
  }

  shouldRefresh(now: number, thresholdMs = 60_000): boolean {
    return now >= this.expiresAt - thresholdMs;
  }

  hasPermission(perm: Permission): boolean {
    return this.permissions.includes(perm);
  }
}
```

```ts
// src/L1_domain/errors/invalid-identity.error.ts
export class InvalidIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIdentityError';
  }
}

// src/L1_domain/errors/refresh-failed.error.ts
export class RefreshFailedError extends Error {
  constructor(message = 'Refresh token invalid or missing') {
    super(message);
    this.name = 'RefreshFailedError';
  }
}

// src/L1_domain/errors/rate-limit.error.ts
export class RateLimitError extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// src/L1_domain/errors/profile-not-available.error.ts
export class ProfileNotAvailableError extends Error {
  constructor(message = 'Profile not available') {
    super(message);
    this.name = 'ProfileNotAvailableError';
  }
}
```

### L1 — value-objects de perfil

```ts
// src/L1_domain/value-objects/student-profile.ts
export interface StudentProfile {
  readonly id: string;        // Student.id — distinto de Identity.id (TenantUser.id)
  readonly code: string;      // DNI peruano (ej. "79507732")
  readonly firstName: string;
  readonly lastName: string;
  readonly area: string | null; // null si el alumno no rindió examen aún
}

// src/L1_domain/value-objects/tutor-profile.ts
export interface TutorClassroom {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly modality: 'presencial' | 'virtual';
  readonly shift: 'manana' | 'tarde' | 'noche';
  readonly campusName: string | null;
  readonly cycleId: string;
  readonly cycleName: string;
  readonly studentCount: number;
}

export interface TutorProfile {
  readonly id: string;        // Tutor.id — distinto de Identity.id
  readonly code: string;      // Código interno tutor (ej. "T001")
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly classrooms: ReadonlyArray<TutorClassroom>; // puede ser []
}
```

### L1 — puertos

```ts
// src/L1_domain/ports/auth-repository.ts
import { Identity, Role } from '../entities/identity';
import { StudentProfile } from '../value-objects/student-profile';
import { TutorProfile } from '../value-objects/tutor-profile';

export interface AuthRepository {
  login(credentials: { email: string; password: string }): Promise<Identity>;
  me(): Promise<Identity>;
  refresh(): Promise<Identity>;
  logout(): Promise<void>;
  getProfile(role: Role): Promise<StudentProfile | TutorProfile>;
}

// src/L1_domain/ports/identity-storage.ts
import { Identity } from '../entities/identity';
export interface IdentityStorage {
  read(): Promise<Identity | null>;
  write(identity: Identity): Promise<void>;
  clear(): Promise<void>;
}

// src/L1_domain/ports/profile-storage.ts
import { Role } from '../entities/identity';
import { StudentProfile } from '../value-objects/student-profile';
import { TutorProfile } from '../value-objects/tutor-profile';

export interface CachedProfile<T extends StudentProfile | TutorProfile = StudentProfile | TutorProfile> {
  readonly profile: T;
  readonly cachedAt: number; // ms timestamp
}

export interface ProfileStorage {
  read(role: Role): Promise<CachedProfile | null>;
  write(role: Role, profile: StudentProfile | TutorProfile): Promise<void>;
  clear(): Promise<void>;
}
```

### L2 — use cases (firmas)

```ts
// src/L2_application/use-cases/login.use-case.ts
export class LoginUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly identityStorage: IdentityStorage,
    private readonly getProfile: GetProfileUseCase, // fire-and-forget
  ) {}

  async execute(credentials: { email: string; password: string }): Promise<Identity> {
    const identity = await this.authRepo.login(credentials);
    await this.identityStorage.write(identity);
    // Fire-and-forget — no `await`.
    void this.getProfile.execute(identity.role()).catch((err) => {
      console.warn('profile fetch post-login failed', err);
    });
    return identity;
  }
}

// src/L2_application/use-cases/initialize-session.use-case.ts
export class InitializeSessionUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly identityStorage: IdentityStorage,
    private readonly getProfile: GetProfileUseCase,
  ) {}

  async execute(): Promise<Identity | null> {
    try {
      const identity = await this.authRepo.me();
      await this.identityStorage.write(identity);
      void this.getProfile.execute(identity.role()).catch(() => undefined);
      return identity;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await this.identityStorage.clear();
        return null;
      }
      if (err instanceof NetworkError) {
        throw err; // caller decide (pantalla offline)
      }
      throw err;
    }
  }
}

// src/L2_application/use-cases/refresh-identity.use-case.ts
export class RefreshIdentityUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly identityStorage: IdentityStorage,
    private readonly logout: LogoutUseCase,
  ) {}

  async execute(): Promise<Identity> {
    try {
      const identity = await this.authRepo.refresh();
      await this.identityStorage.write(identity);
      return identity;
    } catch (err) {
      if (err instanceof RefreshFailedError) {
        await this.logout.execute();
      }
      throw err;
    }
  }
}

// src/L2_application/use-cases/get-profile.use-case.ts
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export class GetProfileUseCase {
  constructor(
    private readonly profileStorage: ProfileStorage,
    private readonly authRepo: AuthRepository,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  async execute(role: Role): Promise<StudentProfile | TutorProfile> {
    const cached = await this.profileStorage.read(role);
    if (cached && this.nowMs() - cached.cachedAt < PROFILE_TTL_MS) {
      return cached.profile;
    }
    const profile = await this.authRepo.getProfile(role);
    await this.profileStorage.write(role, profile);
    return profile;
  }
}

// src/L2_application/use-cases/get-identity.use-case.ts (renombrado de GetActiveSessionUseCase)
export class GetIdentityUseCase {
  constructor(
    private readonly identityStorage: IdentityStorage,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  async execute(): Promise<Identity | null> {
    const identity = await this.identityStorage.read();
    if (!identity) return null;
    if (identity.isExpired(this.nowMs())) {
      // Identity expirada — el próximo request 401 dispara refresh; aquí solo retornamos null.
      return null;
    }
    return identity;
  }
}
```

## Pseudo-código del `credentials.interceptor.ts`

```ts
// src/L3_periphery/interceptors/credentials.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, finalize, shareReplay, switchMap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { RefreshFailedError } from '../../L1_domain/errors/refresh-failed.error';
import { REFRESH_IDENTITY_USE_CASE, LOGOUT_USE_CASE } from '../../app.tokens';

// Lock módulo-level — único refresh en vuelo a la vez para toda la app.
let refreshInFlight$: Observable<void> | null = null;

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  // Solo interceptamos requests al back.
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const cloned = req.clone({ withCredentials: true });

  return next(cloned).pipe(
    catchError((err) => {
      const isAuthEndpoint = req.url.includes('/auth/');
      if (err.status !== 401 || isAuthEndpoint) {
        return throwError(() => err);
      }

      // 401 en endpoint protegido → ensureRefreshed + retry una vez.
      return ensureRefreshed().pipe(
        switchMap(() => next(cloned)),
        catchError((refreshErr) => {
          if (refreshErr instanceof RefreshFailedError) {
            const logout = inject(LOGOUT_USE_CASE);
            void logout.execute(); // fire-and-forget — navega a /login.
          }
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};

function ensureRefreshed(): Observable<void> {
  if (refreshInFlight$) {
    return refreshInFlight$;
  }
  const refresh = inject(REFRESH_IDENTITY_USE_CASE);
  refreshInFlight$ = from(refresh.execute()).pipe(
    // Después del refresh exitoso emitimos `void` para que `switchMap` reintente.
    switchMap(() => [undefined as void]),
    shareReplay(1),
    finalize(() => {
      refreshInFlight$ = null;
    }),
  );
  return refreshInFlight$;
}
```

**Notas críticas:**

1. **`inject()` dentro de `HttpInterceptorFn`** está OK porque la función corre en contexto de inyección. Lo mismo dentro de `catchError` porque la subscripción ocurre durante el flujo del interceptor.
2. **`refreshInFlight$` módulo-level** funciona como singleton — el lock cubre toda la app sin pasar por DI. Si los tests tienen problemas con state cross-test, encapsular en un servicio `@Injectable({ providedIn: 'root' })` `RefreshLockService` con la misma lógica.
3. **`shareReplay(1)`** garantiza que múltiples suscriptores reciban el resultado del mismo refresh.
4. **`finalize`** resetea el lock al terminar (sea success o error). Sin esto el lock queda atascado.
5. **Skip de `/auth/*`** es crítico: si `/auth/refresh` devuelve 401, NO debemos llamar `/auth/refresh` de nuevo. La skip cubre `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/refresh`.
6. **Logout fire-and-forget en el catch de refresh fail**: el use case se encarga de navegar a `/login`. El interceptor solo propaga el error al caller (que puede mostrar un toast).

## Path builder L3

```ts
// src/L3_periphery/http/api-paths.ts
import { environment } from '../../environments/environment';
import { Role } from '../../L1_domain/entities/identity';

const base = () => `${environment.apiBaseUrl}/t/${environment.tenantSlug}`;

export const apiPath = {
  login: () => `${base()}/auth/login`,
  refresh: () => `${base()}/auth/refresh`,
  logout: () => `${base()}/auth/logout`,
  me: () => `${base()}/auth/me`,
  profile: (role: Role) => `${base()}/${role}/me`,
};
```

**Regla.** Ningún adapter L3 escribe `/t/...` a mano. Todos pasan por `apiPath`. El test del spec `http-client` "Prohibido el literal del slug en `src/`" se cumple porque `vonex` solo aparece en `environment.ts` generado y en `.env.example`.

## Wiring DI (`app.config.ts` cambios)

Diff conceptual (el archivo actual está en `src/app.config.ts`):

```ts
// REMOVE — providers actuales:
import { authHeadersInterceptor } from './L3_periphery/interceptors/auth-headers.interceptor';
import { ActualizarBearerSiRenovadoUseCase } from './L2_application/use-cases/actualizar-bearer-si-renovado.use-case';
import { GetActiveSessionUseCase } from './L2_application/use-cases/get-active-session.use-case';
import { LocalStorageSessionStorage } from './L3_periphery/storage/local-storage-session-storage';
import { SessionStorage } from './L1_domain/ports/session-storage';

export const SESSION_STORAGE = new InjectionToken<SessionStorage>('SESSION_STORAGE');
// ...
provideHttpClient(withInterceptors([authHeadersInterceptor])),
{ provide: SESSION_STORAGE, useExisting: LocalStorageSessionStorage },
{ provide: ActualizarBearerSiRenovadoUseCase, useFactory: ..., deps: [SESSION_STORAGE] },
{ provide: GetActiveSessionUseCase, useFactory: ..., deps: [SESSION_STORAGE] },

// ADD — nuevos providers:
import { credentialsInterceptor } from './L3_periphery/interceptors/credentials.interceptor';
import { IdentityStorage } from './L1_domain/ports/identity-storage';
import { ProfileStorage } from './L1_domain/ports/profile-storage';
import { LocalStorageIdentityStorage } from './L3_periphery/storage/local-storage-identity-storage';
import { IndexedDbProfileStorage } from './L3_periphery/storage/indexed-db-profile-storage';
import { InitializeSessionUseCase } from './L2_application/use-cases/initialize-session.use-case';
import { RefreshIdentityUseCase } from './L2_application/use-cases/refresh-identity.use-case';
import { GetProfileUseCase } from './L2_application/use-cases/get-profile.use-case';
import { GetIdentityUseCase } from './L2_application/use-cases/get-identity.use-case';

export const IDENTITY_STORAGE = new InjectionToken<IdentityStorage>('IDENTITY_STORAGE');
export const PROFILE_STORAGE = new InjectionToken<ProfileStorage>('PROFILE_STORAGE');
export const INITIALIZE_SESSION_USE_CASE = new InjectionToken<InitializeSessionUseCase>('INITIALIZE_SESSION_USE_CASE');
export const REFRESH_IDENTITY_USE_CASE = new InjectionToken<RefreshIdentityUseCase>('REFRESH_IDENTITY_USE_CASE');
export const LOGOUT_USE_CASE = new InjectionToken<LogoutUseCase>('LOGOUT_USE_CASE');

// providers: [...
provideHttpClient(withInterceptors([credentialsInterceptor])),
{ provide: IDENTITY_STORAGE, useExisting: LocalStorageIdentityStorage },
{ provide: PROFILE_STORAGE, useExisting: IndexedDbProfileStorage },

{
  provide: GetProfileUseCase,
  useFactory: (storage: ProfileStorage, repo: AuthRepository) =>
    new GetProfileUseCase(storage, repo),
  deps: [PROFILE_STORAGE, AUTH_REPOSITORY],
},
{
  provide: LoginUseCase,
  useFactory: (repo: AuthRepository, storage: IdentityStorage, gp: GetProfileUseCase) =>
    new LoginUseCase(repo, storage, gp),
  deps: [AUTH_REPOSITORY, IDENTITY_STORAGE, GetProfileUseCase],
},
{
  provide: LogoutUseCase,
  useFactory: (repo, idStorage, profStorage, markings, outbox, router) =>
    new LogoutUseCase(repo, idStorage, profStorage, markings, outbox, router),
  deps: [AUTH_REPOSITORY, IDENTITY_STORAGE, PROFILE_STORAGE, MARKINGS_STORAGE, OUTBOX_STORAGE, Router],
},
{
  provide: GetIdentityUseCase,
  useFactory: (storage: IdentityStorage) => new GetIdentityUseCase(storage),
  deps: [IDENTITY_STORAGE],
},
{
  provide: REFRESH_IDENTITY_USE_CASE,
  useFactory: (repo: AuthRepository, storage: IdentityStorage, logout: LogoutUseCase) =>
    new RefreshIdentityUseCase(repo, storage, logout),
  deps: [AUTH_REPOSITORY, IDENTITY_STORAGE, LogoutUseCase],
},
{
  provide: INITIALIZE_SESSION_USE_CASE,
  useFactory: (repo: AuthRepository, storage: IdentityStorage, gp: GetProfileUseCase) =>
    new InitializeSessionUseCase(repo, storage, gp),
  deps: [AUTH_REPOSITORY, IDENTITY_STORAGE, GetProfileUseCase],
},
{ provide: LOGOUT_USE_CASE, useExisting: LogoutUseCase },

provideAppInitializer(async () => {
  const init = inject(INITIALIZE_SESSION_USE_CASE);
  const router = inject(Router);
  try {
    const identity = await init.execute();
    if (identity) {
      void router.navigate([`/${identity.role()}/home`]);
    } else {
      void router.navigate(['/login']);
    }
  } catch (err) {
    // NetworkError → no navigate; la UI maneja pantalla offline.
    console.warn('AppInitializer failed', err);
  }
}),
```

**Notas:**
- Los `InjectionToken`s para use cases (`LOGOUT_USE_CASE`, `REFRESH_IDENTITY_USE_CASE`, etc.) se introducen porque el interceptor los necesita y no puede importar las clases concretas sin meter ciclo via DI.
- `EnvioRetryDispatcher.start()` actual queda igual; el `provideAppInitializer` se compone en cadena (Angular soporta múltiples).
- Si conviene, mover los `InjectionToken`s nuevos a un archivo `src/app.tokens.ts` separado para no engordar `app.config.ts` y romper el potencial ciclo de imports entre interceptor → tokens → app.config.

## Environment + build-env

### `.env.example` (committed)

```bash
# learnex backend
API_BASE_URL=http://localhost:2001
TENANT_SLUG=vonex
```

### `scripts/build-env.mjs` (cambios)

- Validar `TENANT_SLUG` existe; fail-fast si falta (similar al check actual de `API_KEY`).
- Exponer `tenantSlug` en `src/environments/environment.ts` y `environment.prod.ts`.
- **Eliminar** la generación de `apiKey` (queda inservible).

### `src/environments/environment.ts` (generado, NO editar a mano)

```ts
export const environment = {
  apiBaseUrl: 'http://localhost:2001',
  tenantSlug: 'vonex',
  production: false,
};
```

### `ngsw-config.json` — verificar exclusiones

- `assetGroups`: solo shell + iconos.
- `dataGroups`: no debe cachear `**/t/*/auth/**` ni `**/t/*/student/me` ni `**/t/*/tutor/me`. Si existe un dataGroup que matchea el back en general, agregar `urls` con patrón excluyente. Verificar manualmente al implementar.

## Plan de tests detallado

| Archivo | Fate | Tests aprox. | Notas |
|---|---|---|---|
| **L1 (puros, sin Angular)** | | | |
| `tests/unit/L1_domain/entities/identity.spec.ts` | NEW | 12 | constructor invariante, `role()`, `isExpired`, `shouldRefresh`, `hasPermission` |
| `tests/unit/L1_domain/value-objects/student-profile.spec.ts` | NEW | 3 | shape, `area: null` válido |
| `tests/unit/L1_domain/value-objects/tutor-profile.spec.ts` | NEW | 4 | shape, `classrooms: []` válido, `studentCount` |
| `tests/unit/L1_domain/errors/invalid-identity.error.spec.ts` | NEW | 1 | `name` correcto |
| `tests/unit/L1_domain/errors/refresh-failed.error.spec.ts` | NEW | 1 | |
| `tests/unit/L1_domain/errors/rate-limit.error.spec.ts` | NEW | 1 | |
| `tests/unit/L1_domain/errors/profile-not-available.error.spec.ts` | NEW | 1 | |
| `tests/unit/L1_domain/entities/session.spec.ts` | DELETE | — | Session eliminada |
| `tests/unit/L1_domain/value-objects/bearer-token.spec.ts` | DELETE | — | BearerToken eliminado |
| **L2 (puros)** | | | |
| `tests/unit/L2_application/use-cases/login.use-case.spec.ts` | REWRITE | 8 | retorna Identity, dispara getProfile fire-and-forget, 401/429/Network |
| `tests/unit/L2_application/use-cases/logout.use-case.spec.ts` | REWRITE | 6 | orden de pasos, best-effort en `repo.logout`, idempotente sin identity |
| `tests/unit/L2_application/use-cases/get-identity.use-case.spec.ts` | REWRITE (rename) | 4 | renombrado de `get-active-session.use-case.spec`, suma check `isExpired` |
| `tests/unit/L2_application/use-cases/initialize-session.use-case.spec.ts` | NEW | 6 | happy path, 401 → clear + null, NetworkError → propaga sin clear |
| `tests/unit/L2_application/use-cases/refresh-identity.use-case.spec.ts` | NEW | 4 | success → update storage; RefreshFailedError → logout |
| `tests/unit/L2_application/use-cases/get-profile.use-case.spec.ts` | NEW | 6 | cache hit fresh, cache miss, cache stale (TTL 24h), reemplazo si distinto |
| `tests/unit/L2_application/use-cases/actualizar-bearer-si-renovado.use-case.spec.ts` | DELETE | — | use case eliminado |
| **L3 (jsdom + HttpTestingController + fake-indexeddb)** | | | |
| `tests/feature/L3_periphery/http/http-auth-repository.spec.ts` | REWRITE | 18 | login/me/refresh/logout/getProfile + tabla de clasificación de errores |
| `tests/feature/L3_periphery/http/api-paths.spec.ts` | NEW | 5 | paths bien formados, `environment.tenantSlug` usado |
| `tests/feature/L3_periphery/interceptors/credentials.interceptor.spec.ts` | NEW | 10 | `withCredentials` en `apiBaseUrl`, skip externos, refresh+retry, lock con 3 requests paralelos, skip `/auth/*`, RefreshFailedError → logout |
| `tests/feature/L3_periphery/storage/local-storage-identity-storage.spec.ts` | REWRITE (rename) | 8 | write/read round-trip, JSON corrupto → clear, shape inválido → clear, `lugia.session` legacy ignorada |
| `tests/feature/L3_periphery/storage/indexed-db-profile-storage.spec.ts` | NEW | 6 | write+read fresh, stale 25h, miss, clear ambos roles |
| `tests/feature/L3_periphery/storage/indexed-db-markings-storage.spec.ts` | EXPAND | +2 | inyecta `IdentityStorage` (no `LocalStorageIdentityStorage`); `wipeUserScope` con identity null = no-op |
| `tests/feature/L3_periphery/guards/auth.guard.spec.ts` | REWRITE | 4 | consume `GetIdentityUseCase`, redirige a `/login` si null |
| `tests/feature/L3_periphery/guards/public-only.guard.spec.ts` | REWRITE | 4 | redirige a `/{role}/home` si identity |
| `tests/feature/L3_periphery/guards/role.guard.spec.ts` | NEW | 6 | match → allow, mismatch → redirect a `/{role}/home`, no identity → `/login` |
| `tests/feature/L3_periphery/interceptors/auth-headers.interceptor.spec.ts` | DELETE | — | interceptor eliminado |
| **LR (jsdom + TestBed)** | | | |
| `tests/feature/LR_render/view-models/login.view-model.spec.ts` | EXPAND | +4 | 429 → `errorMessage`, navigate a `/{role}/home` según rol |
| `tests/feature/LR_render/view-models/student-home.view-model.spec.ts` | EXPAND (rename) | 8 | consume `GetProfileUseCase`, skeleton mientras pending, `ProfileNotAvailableError` degraded |
| `tests/feature/LR_render/view-models/tutor-home.view-model.spec.ts` | NEW | 8 | stats con N aulas + M alumnos, empty state, badge "Tutor", logout |
| `tests/feature/LR_render/app.routes.spec.ts` | EXPAND | +6 | redirects legacy `/home` y `/simulacro/:id`, rutas `/student/*` y `/tutor/*` |
| `tests/feature/LR_render/pages/login/login.page.spec.ts` | EXPAND | +2 | mensaje de rate limit visible |
| **Infra / config** | | | |
| `tests/feature/app-initializer.spec.ts` | NEW | 4 | success → navigate `/{role}/home`, 401 → `/login`, NetworkError → no navigate |

**Total estimado.** ~75 archivos tocados (NEW + REWRITE + EXPAND + DELETE). El gross test count nuevo o reescrito ronda 140 tests. Mocks de `AuthRepository` se centralizan en un fixture `tests/unit/fixtures/auth-repository.fake.ts` para evitar duplicación.

## Slicing de PRs

El change es grande (~1200-1500 líneas net considerando deletes). Se propone chained PRs, cada uno verde antes de mergear el siguiente.

### PR1 — L1 + L2 puros (~400 líneas)

**Scope.**
- DELETE: `L1_domain/entities/session.ts`, `L1_domain/value-objects/bearer-token.ts`, `L1_domain/errors/invalid-session.error.ts`, `L1_domain/ports/session-storage.ts`.
- DELETE: `L2_application/use-cases/actualizar-bearer-si-renovado.use-case.ts`.
- NEW: `Identity`, `StudentProfile`, `TutorProfile`, `InvalidIdentityError`, `RefreshFailedError`, `RateLimitError`, `ProfileNotAvailableError`, `IdentityStorage`, `ProfileStorage`, `AuthRepository` evolucionado.
- REWRITE: `LoginUseCase`, `LogoutUseCase`, `GetIdentityUseCase` (rename de `GetActiveSessionUseCase`).
- NEW: `InitializeSessionUseCase`, `RefreshIdentityUseCase`, `GetProfileUseCase`.
- Tests L1 + L2 (~40 archivos test, ~75 tests netos nuevos/reescritos).

**Criterio de merge.** `npm run lint` + `npm test -- unit` verdes. Build NO pasará todavía (L3/LR siguen importando símbolos eliminados).

### PR2 — L3 (adapters) + fix layer violation (~500 líneas)

**Scope.**
- DELETE: `L3_periphery/interceptors/auth-headers.interceptor.ts`, `L3_periphery/storage/local-storage-session-storage.ts`.
- NEW: `credentials.interceptor.ts`, `api-paths.ts`, `LocalStorageIdentityStorage`, `IndexedDbProfileStorage`, `roleGuard`.
- REWRITE: `HttpAuthRepository` (login/me/refresh/logout/getProfile + tabla de clasificación con `code`), `authGuard`, `publicOnlyGuard`.
- FIX: `IndexedDbMarkingsStorage` inyecta `IdentityStorage` por token, no `LocalStorageSessionStorage` directo.
- Tests L3 (~15 archivos, ~50 tests netos).

**Criterio de merge.** Lint + test (unit + feature) verde. Build aún roto porque LR sigue importando `HomePage` viejo y app.config tiene providers desfasados — se tolera en la rama; los providers viejos se templ-comentan para que TypeScript no se queje, o se mete junto con LR en PR3.

**Nota práctica.** Si PR2 sin PR3 deja el build rojo, considerar fusionar PR2 + PR3 en uno solo de ~900 líneas. La decisión final la tomará `sdd-tasks` con presupuesto.

### PR3 — LR + infra + docs (~400 líneas)

**Scope.**
- Routing: nuevas rutas `/student/*` y `/tutor/*`, redirects legacy desde `/home` y `/simulacro/:id`.
- REWRITE: `LoginViewModel` (429 + role-based navigate).
- REWRITE: `HomePage` → `StudentHomePage` + `StudentHomeViewModel` (consume `GetProfileUseCase`, skeleton, degraded state).
- NEW: `TutorHomePage` + `TutorHomeViewModel` (stub con badge, stats, logout, empty state).
- REWRITE: `src/app.config.ts` con providers nuevos + `provideAppInitializer(InitializeSessionUseCase)`.
- Infra: `scripts/build-env.mjs` (TENANT_SLUG + remove apiKey), `.env.example`, verificar `ngsw-config.json`.
- Docs: `CLAUDE.md` regla #3 actualizada, `agents/api-contract.md` sección learnex.
- Tests LR (~20 archivos, ~30 tests netos).

**Criterio de merge.** Lint + format + build + test ALL verdes. Smoke manual: login alumno → home con perfil; login tutor → home con stats; logout → `/login` y refresh sigue ahí; reload con cookie válida → directo a `/{role}/home`.

## Trade-offs documentados

- **JWT 15m TTL.** Aceptado por ahora. Durante un examen de 2h habrá ~8 refreshes silenciosos. Visible en devtools pero invisible al usuario. Si learnex lo sube a 30-60m, podemos seguir sin pre-emptive timer; si queda 15m, considerar reintroducir el timer en una iteración posterior.
- **iOS Safari ITP purge tras 7 días.** Aceptado. UX mitigation: `autocomplete="username"` en el input email del login para que el autofill nativo asista.
- **SW no ve cookies HttpOnly.** Aceptado y considerado: el SW maneja solo assets + outbox; toda la lógica de auth queda en main thread. `ngsw-config.json` excluye `/auth/*` y `/{role}/me` de cualquier `dataGroup`.
- **Cartilla rota en runtime durante la ventana entre este change y `fase-3-exam-learnex`.** Explícito y aceptado. La app está en dev. Coordinar que el siguiente change arranque inmediatamente.
- **Tests masivos rotos en transición.** Mitigado por slicing L1 → L2 → L3 → LR con CI verde en cada paso. No hay "big bang" simultáneo.
- **`refreshInFlight$` módulo-level vs injectable service.** Aceptado módulo-level por simplicidad. Si tests cross-suite tienen estado contaminado, refactor trivial a `RefreshLockService @Injectable({providedIn:'root'})`.

## Open questions

### Resueltas en este design

- **Orden de pasos del logout** (Risk #1 → leer email → repo.logout best-effort → markings → outbox → profile → identity → SW → navigate).
- **Manejo del error en `repo.logout()`** (Risk #2 → best-effort con `console.warn`).
- **Redirect raíz `/`** (Risk #3 → mantener `'': redirectTo: '/login'`).
- **Estrategia de slicing de PRs** (3 chained: L1+L2 / L3 / LR+infra+docs, con escape hatch a fusionar PR2+PR3).
- **Ubicación del lock de refresh** (módulo-level, con plan de escape a `@Injectable` si los tests lo piden).
- **TTL del profile cache** (24h, evaluado en `GetProfileUseCase`, no en el storage).

### Aún abiertas (fuera de scope de este change)

- **TTL JWT 15m vs 30-60m.** Conversación pendiente con equipo learnex.
- **Endpoints learnex para examen.** Bloquean `fase-3-exam-learnex`. Coordinar contrato similar al que está en `.authentic/pwa-auth-contract.md`.
- **CORS prod allowlist.** Cuando se defina dominio prod (¿`m.vonex.edu.pe`?) pedir a learnex pasar de `origin: true` a allowlist explícita.
- **Pre-emptive refresh timer.** Decisión depende del TTL acordado.
- **Multi-rol futuro.** Si learnex agrega users con `roles: ['tutor', 'student']`, el invariante de `Identity.role()` se relaja y aparece switcher. Fuera de scope.
- **Multi-tenant runtime.** Por ahora multi-build (un slug por build). Si el producto requiere servir N tenants desde una sola build, `tenantSlug` pasa a resolverse por hostname.

## Migration Plan

Sin migración de datos productiva (estamos en dev). El plan operativo:

1. **Backend.** learnex ya corre en `localhost:2001` con seed users (`tutor1@vonex.pe / tutor123`, `79507732@vonex.edu.pe / 79507732`). Contrato verificado al 2026-06-13 en `.authentic/pwa-auth-contract.md`.
2. **Orden de implementación.** PR1 (L1+L2) → PR2 (L3) → PR3 (LR + infra + docs). Cada PR pasa lint + tests verdes antes de mergear. Smoke manual al cierre de PR3.
3. **Rollback.** No aplica: la cartilla queda rota intencionalmente entre este change y `fase-3-exam-learnex`. Si algo del login/home stub revienta, revertir el merge del PR correspondiente y rearmar.
4. **Comunicación.** El usuario ya aceptó la ventana de cartilla rota. Documentar en `docs/agent-activity.md` cuando se mergee el último PR para que cualquier sesión futura sepa el estado.

Per [[feedback-workflow-discipline]]: 1 commit quirúrgico por sección SDD y por capability implementada. Subagentes: `frontend-builder` para LR, `test-engineer` para tests, `hexagonal-guard` antes de archive.
