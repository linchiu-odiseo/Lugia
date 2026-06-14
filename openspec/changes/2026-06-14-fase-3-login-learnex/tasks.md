## Contexto del change

`fase-3-login-learnex` reemplaza API-FAKE (Sanctum bearer + `X-API-Key`) por learnex (cookies HttpOnly + `withCredentials`, refresh reactivo, multi-rol mínimo). Es un cut-over duro: la cartilla queda rota en runtime hasta `fase-3-exam-learnex`. El change se implementa en **3 PRs encadenadas**; cada PR debe pasar lint/tests/build antes de avanzar a la siguiente.

Resolución de las 3 contradicciones del design documentadas en el prompt de tasks:
- **R1 (wipeUserScope)**: el port `MarkingsStorage.wipeUserScope()` queda **sin argumento** (alineado al spec `session-storage`). El adapter `IndexedDbMarkingsStorage` inyecta `IdentityStorage` y lee el email internamente; si null → no-op. El `LogoutUseCase` mantiene el orden de 8 pasos del design, llamando `wipeUserScope()` ANTES de `identityStorage.clear()` para que el adapter todavía encuentre el email vía el port.
- **R2 (AppInitializer navigate)**: el navigate lo dispara el `provideAppInitializer` en `app.config.ts`, NO la config de rutas. La ruta `''` se mantiene como `redirectTo: '/login'` sin cambio (per D6 del design).
- **R3 (InjectionToken en interceptor)**: el pseudo-código del design sección 5 usa `inject(LOGOUT_USE_CASE)` y `inject(REFRESH_IDENTITY_USE_CASE)` con tokens. El wiring DI (sección "Wiring DI") introduce `REFRESH_IDENTITY_USE_CASE` y `LOGOUT_USE_CASE` como `InjectionToken`s en `app.tokens.ts` para evitar ciclos de importación. El interceptor usa los tokens. Las tasks reflejan esto.

---

## PR1 — L1 Domain + L2 Application puros

> Alcance: TypeScript puro, sin `@angular/*`, sin `rxjs`, sin browser APIs. Tests en `tests/unit/`.
> Al terminar PR1: `npm run lint` + `npm test -- --reporter=verbose tests/unit` verdes.
> El build de la app NO pasará (L3/LR siguen referenciando símbolos eliminados — se tolera).

### L1 Domain: entidad Identity

- [x] Crear `src/L1_domain/entities/identity.ts` — clase `Identity` con constructor (`id`, `tenantId`, `email`, `codigo: string | null`, `roles: ReadonlyArray<Role>`, `permissions: ReadonlyArray<Permission>`, `expiresAt: number`). El constructor lanza `InvalidIdentityError` si `roles.length !== 1`. Métodos: `role()`, `isExpired(now: number): boolean`, `shouldRefresh(now: number, thresholdMs?: number): boolean`, `hasPermission(perm: Permission): boolean`. Exportar tipos `Role = 'student' | 'tutor'` y `Permission = string`. _(spec auth-session § Entidad Identity)_
- [x] Crear `tests/unit/L1_domain/entities/identity.spec.ts` — 12 tests cubriendo: constructor con 1 rol OK (student y tutor), constructor con 0 roles lanza `InvalidIdentityError`, constructor con 2 roles lanza `InvalidIdentityError`, `role()` happy path, `isExpired` con `expiresAt` en el pasado, `isExpired` con `expiresAt` en el futuro, `shouldRefresh` dentro del umbral, `shouldRefresh` fuera del umbral, `hasPermission` presente, `hasPermission` ausente. _(spec auth-session § Scenarios Identity)_
- [x] Borrar `src/L1_domain/entities/session.ts`.
- [x] Borrar `tests/unit/L1_domain/entities/session.spec.ts`.

### L1 Domain: value-objects de perfil

- [x] Crear `src/L1_domain/value-objects/student-profile.ts` — interface `StudentProfile { readonly id: string; readonly code: string; readonly firstName: string; readonly lastName: string; readonly area: string | null }`. _(spec auth-profile § Value-objects de perfil)_
- [x] Crear `src/L1_domain/value-objects/tutor-profile.ts` — interfaces `TutorClassroom` (7 campos: `id`, `code`, `name`, `modality: 'presencial'|'virtual'`, `shift: 'manana'|'tarde'|'noche'`, `campusName: string | null`, `cycleId`, `cycleName`, `studentCount`) y `TutorProfile { readonly id: string; readonly code: string; readonly firstName: string; readonly lastName: string; readonly email: string; readonly classrooms: ReadonlyArray<TutorClassroom> }`. _(spec auth-profile § Value-objects de perfil)_
- [x] Crear `tests/unit/L1_domain/value-objects/student-profile.spec.ts` — 3 tests: shape completo, `area: null` válido, construcción por spread. _(spec auth-profile § Scenarios alumno)_
- [x] Crear `tests/unit/L1_domain/value-objects/tutor-profile.spec.ts` — 4 tests: shape completo con 2 aulas, `classrooms: []` válido, suma de `studentCount`, lectura de `code`. _(spec auth-profile § Scenarios tutor)_
- [x] Borrar `src/L1_domain/value-objects/bearer-token.ts`.
- [x] Borrar `tests/unit/L1_domain/value-objects/bearer-token.spec.ts`.

### L1 Domain: errores nuevos

- [x] Crear `src/L1_domain/errors/invalid-identity.error.ts` — clase `InvalidIdentityError extends Error` con `name = 'InvalidIdentityError'`. _(spec auth-session § Errores de dominio)_
- [x] Crear `src/L1_domain/errors/refresh-failed.error.ts` — clase `RefreshFailedError extends Error` con `name = 'RefreshFailedError'`. _(spec auth-session § Errores)_
- [x] Crear `src/L1_domain/errors/rate-limit.error.ts` — clase `RateLimitError extends Error` con `name = 'RateLimitError'`. _(spec auth-session § Errores)_
- [x] Crear `src/L1_domain/errors/profile-not-available.error.ts` — clase `ProfileNotAvailableError extends Error` con `name = 'ProfileNotAvailableError'`. _(spec auth-profile § Mapeo errores HTTP)_
- [x] Borrar `src/L1_domain/errors/invalid-session.error.ts`.
- [x] Actualizar `tests/unit/L1_domain/errors/errors.spec.ts` — agregar 4 tests (uno por error nuevo: nombre correcto). Eliminar test de `InvalidSessionError`. _(spec auth-session § Errores)_

### L1 Domain: puertos

- [x] Reemplazar `src/L1_domain/ports/auth-repository.ts` con la nueva firma de 5 métodos: `login(credentials) → Promise<Identity>`, `me() → Promise<Identity>`, `refresh() → Promise<Identity>`, `logout() → Promise<void>`, `getProfile(role: Role) → Promise<StudentProfile | TutorProfile>`. Eliminar cualquier referencia a `Session` o `BearerToken`. _(spec auth-session § Puerto AuthRepository evolucionado; spec auth-profile § Puerto AuthRepository expone getProfile)_
- [x] Crear `src/L1_domain/ports/identity-storage.ts` — interface `IdentityStorage { read(): Promise<Identity | null>; write(identity: Identity): Promise<void>; clear(): Promise<void> }`. _(spec session-storage § Puerto IdentityStorage)_
- [x] Crear `src/L1_domain/ports/profile-storage.ts` — interface `CachedProfile<T>` con `{ profile: T; cachedAt: number }` e interface `ProfileStorage { read(role: Role): Promise<CachedProfile | null>; write(role: Role, profile: StudentProfile | TutorProfile): Promise<void>; clear(): Promise<void> }`. _(spec session-storage § Puerto ProfileStorage; spec auth-profile § Puerto ProfileStorage)_
- [x] Borrar `src/L1_domain/ports/session-storage.ts`.

### L2 Application: fixture compartido

- [x] Crear `tests/unit/fixtures/auth-repository.fake.ts` — implementación fake de `AuthRepository` con métodos stubbeables (`login`, `me`, `refresh`, `logout`, `getProfile`). Centraliza mocks para todos los tests L2. _(design § Plan de tests — reducir duplicación)_
- [x] Crear `tests/unit/fixtures/identity-storage.fake.ts` — implementación fake de `IdentityStorage` (in-memory map) reutilizable en tests L2.
- [x] Crear `tests/unit/fixtures/profile-storage.fake.ts` — implementación fake de `ProfileStorage` (in-memory map, devuelve `CachedProfile` con `cachedAt` configurable).

### L2 Application: use cases nuevos

- [x] Crear `src/L2_application/use-cases/initialize-session.use-case.ts` — clase `InitializeSessionUseCase` con constructor recibiendo `authRepo: AuthRepository`, `identityStorage: IdentityStorage`, `getProfile: GetProfileUseCase`. Método `execute(): Promise<Identity | null>`: llama `repo.me()`, si OK escribe identity y dispara profile (fire-and-forget), si `SessionExpiredError` limpia storage y devuelve `null`, si `NetworkError` propaga sin limpiar. _(spec auth-session § InitializeSessionUseCase; spec auth-ui § AppInitializer)_
- [x] Crear `tests/unit/L2_application/use-cases/initialize-session.use-case.spec.ts` — 6 tests: happy path student (identity escrita + profile disparado), happy path tutor, `SessionExpiredError` → storage cleared + null devuelto, `NetworkError` → storage no tocado + error propagado, storage ya vacío al `SessionExpiredError` no falla, profile fetch falla silenciosamente (fire-and-forget). _(spec auth-session § Scenarios InitializeSession)_
- [x] Crear `src/L2_application/use-cases/refresh-identity.use-case.ts` — clase `RefreshIdentityUseCase` con constructor recibiendo `authRepo: AuthRepository`, `identityStorage: IdentityStorage`, `logout: LogoutUseCase`. Método `execute(): Promise<Identity>`: llama `repo.refresh()`, actualiza storage, si `RefreshFailedError` invoca logout y re-lanza. _(spec auth-session § RefreshIdentityUseCase)_
- [x] Crear `tests/unit/L2_application/use-cases/refresh-identity.use-case.spec.ts` — 4 tests: refresh exitoso actualiza storage, `RefreshFailedError` invoca `logout.execute()`, `RefreshFailedError` re-propaga el error, error genérico propaga sin logout. _(spec auth-session § Scenarios RefreshIdentity)_
- [x] Crear `src/L2_application/use-cases/get-profile.use-case.ts` — clase `GetProfileUseCase` con constructor recibiendo `profileStorage: ProfileStorage`, `authRepo: AuthRepository`, `nowMs: () => number`. Constante `PROFILE_TTL_MS = 24 * 60 * 60 * 1000`. Método `execute(role: Role): Promise<StudentProfile | TutorProfile>`: lee cache, si fresh devuelve sin fetch, si miss/stale hace fetch → escribe → devuelve. _(spec auth-profile § GetProfileUseCase cache TTL 24h)_
- [x] Crear `tests/unit/L2_application/use-cases/get-profile.use-case.spec.ts` — 6 tests: cache hit fresh (no fetch), cache miss (fetch + write), cache stale 25h (fetch + reemplazo), fetch devuelve perfil diferente al cache (reemplazo), `ProfileNotAvailableError` propagado, `NetworkError` propagado. _(spec auth-profile § Scenarios GetProfile)_

### L2 Application: rewrites de use cases existentes

- [x] Reescribir `src/L2_application/use-cases/login.use-case.ts` — constructor recibe `authRepo: AuthRepository`, `identityStorage: IdentityStorage`, `getProfile: GetProfileUseCase`. `execute()` devuelve `Promise<Identity>`, escribe en `identityStorage`, dispara `getProfile.execute(identity.role())` fire-and-forget. Sin referencias a `Session` ni `BearerToken`. _(spec auth-session § LoginUseCase reescrito)_
- [x] Reescribir `tests/unit/L2_application/login.use-case.spec.ts` — 8 tests: login alumno exitoso (devuelve Identity, identity en storage, profile fire-and-forget), login tutor exitoso, `InvalidCredentialsError` propagado (sin write a storage), `RateLimitError` propagado, `NetworkError` propagado, profile fetch falla silenciosamente, identity escrita antes de retorno, fire-and-forget no bloquea el retorno. _(spec auth-session § Scenarios LoginUseCase)_
- [x] Reescribir `src/L2_application/use-cases/logout.use-case.ts` — constructor recibe `authRepo: AuthRepository`, `identityStorage: IdentityStorage`, `profileStorage: ProfileStorage`, `markingsStorage: MarkingsStorage`, `outboxStorage: OutboxStoragePort`, `router: RouterPort`, `swMessenger?: SwMessengerPort`. Orden de 8 pasos: (1) `identity = await identityStorage.read()`; si null → solo navigate y return, (2) `try { await authRepo.logout() } catch { warn }`, (3) `await markingsStorage.wipeUserScope()` **sin argumento** — el adapter lee `IdentityStorage` internamente, (4) `await outboxStorage.clear()` si existe, (5) `await profileStorage.clear()`, (6) `await identityStorage.clear()`, (7) `swMessenger?.post({type:'LOGOUT'})`, (8) `router.navigate(['/login'])`. **CRÍTICO: `wipeUserScope()` ANTES de `identityStorage.clear()`** (sino el adapter ya no encuentra el email para armar el scope). _(spec auth-session § LogoutUseCase expandido; spec session-storage § wipeUserScope; design § Risk #1 y #2)_
- [x] Reescribir `tests/unit/L2_application/logout.use-case.spec.ts` — 6 tests: logout completo con identity (todos los pasos invocados en orden), `repo.logout()` falla → limpieza local igual se ejecuta, identity null → solo navigate (no `wipeUserScope` ni clears), `wipeUserScope()` se invoca ANTES de `identityStorage.clear()` (mock con orden estricto), navigate a `/login` siempre, `swMessenger.post` opcional. _(spec auth-session § Scenarios Logout; design § Risk #1)_
- [x] Renombrar `src/L2_application/use-cases/get-active-session.use-case.ts` → `src/L2_application/use-cases/get-identity.use-case.ts`. Actualizar clase a `GetIdentityUseCase`, cambiar retorno para usar `Identity` y verificar `identity.isExpired(this.nowMs())`. Constructor recibe `identityStorage: IdentityStorage`, `nowMs: () => number`. _(spec auth-session § GetIdentityUseCase)_
- [x] Renombrar `tests/unit/L2_application/get-active-session.use-case.spec.ts` → `tests/unit/L2_application/use-cases/get-identity.use-case.spec.ts`. Reescribir con 4 tests: identity válida devuelta, storage vacío → null, identity expirada → null, `nowMs` inyectado permite control del tiempo. _(spec auth-session § Scenarios GetIdentity)_
- [x] Borrar `src/L2_application/use-cases/actualizar-bearer-si-renovado.use-case.ts`.
- [x] Borrar `tests/unit/L2_application/actualizar-bearer-si-renovado.use-case.spec.ts`.

### L2 Application: definición de ports auxiliares para LogoutUseCase

> `LogoutUseCase` necesita `RouterPort` y `OutboxStoragePort` como interfaces L2 o L1 para evitar importar Angular o IndexedDB directamente.

- [x] Crear `src/L1_domain/ports/router-port.ts` — interface `RouterPort { navigate(commands: unknown[]): void }`. Permite que L2 use la navegación sin importar `@angular/router`. _(regla inviolable #2: L2 es TypeScript puro)_
- [x] Actualizar `src/L1_domain/ports/markings-storage.ts` para que `wipeUserScope(): Promise<void>` sea **sin argumento**. El email NO viaja por el port; el adapter lee `IdentityStorage` internamente para resolver el scope. Esto preserva la independencia conceptual entre identity y markings y respeta el spec. _(spec session-storage § wipeUserScope sin identity = no-op)_
- [x] Crear `src/L1_domain/ports/outbox-storage.port.ts` — interface `OutboxStoragePort { clear(): Promise<void> }`. Puerto auxiliar para `LogoutUseCase`. _(tasks § L2 Application: definición de ports auxiliares)_
- [x] Crear `src/L1_domain/ports/sw-messenger.port.ts` — interface `SwMessengerPort { post(message: { type: string }): void }`. Puerto auxiliar opcional para notificar al SW en logout. _(tasks § L2 Application: definición de ports auxiliares)_

---

> **Criterio de merge PR1**: `npm run lint` + `npm test -- --reporter=verbose tests/unit` 100% verde. La suite feature y el build pueden fallar — se tolera en esta rama. Estimar ~400 líneas netas (nuevas/reescritas).

---

## PR2 — L3 Periphery adapters

> Depende de PR1 mergeado. Alcance: adapters Angular (HTTP, storage, interceptors, guards).
> Al terminar PR2: `npm run lint` + `npm test -- --reporter=verbose tests/unit tests/feature` verdes.
> El build de la app sigue roto por LR (se tolera hasta PR3).

### L3: Tokens de DI

- [ ] Crear `src/app.tokens.ts` — archivo nuevo con los `InjectionToken`s: `IDENTITY_STORAGE`, `PROFILE_STORAGE`, `REFRESH_IDENTITY_USE_CASE`, `LOGOUT_USE_CASE`, `INITIALIZE_SESSION_USE_CASE`. Separar de `app.config.ts` para evitar ciclos de import entre interceptor → tokens → config. _(design § Wiring DI — notas; design § pseudo-código interceptor)_

### L3: Path builder

- [ ] Crear `src/L3_periphery/http/api-paths.ts` — objeto `apiPath` con funciones: `login()`, `refresh()`, `logout()`, `me()`, `profile(role: Role)`. Cada función interpola `environment.apiBaseUrl` + `/t/${environment.tenantSlug}/...`. Ninguna cadena literal `"vonex"` en el archivo. _(spec http-client § Path builder; design § Path builder L3)_
- [ ] Crear `tests/feature/L3_periphery/http/api-paths.spec.ts` — 5 tests: paths correctos para login/refresh/logout/me, `profile('student')` forma `/student/me`, `profile('tutor')` forma `/tutor/me`, el slug viene de `environment.tenantSlug` (no hardcodeado), ausencia de literales slug en el módulo. _(spec http-client § Scenarios path builder)_

### L3: HTTP auth repository

- [ ] Reescribir `src/L3_periphery/http/http-auth-repository.ts` — implementar `AuthRepository` con 5 métodos usando `apiPath.*` para URLs. Mapeo `login()`: body `{user, expiresAt}` → `new Identity(...)`. Mapeo de errores por `(status, endpoint, code)`: 401 en login con `TENANT_AUTH_INVALID_CREDENTIALS` → `InvalidCredentialsError`, 429 → `RateLimitError`, 401 en refresh con `TENANT_AUTH_REFRESH_TOKEN_INVALID`/`MISSING` → `RefreshFailedError`, 403/404 en `/{role}/me` → `ProfileNotAvailableError`, red/5xx → `NetworkError`. Prohibido leer `error.error?.message`. `logout()` hace `POST apiPath.logout()` (best-effort, puede propagar `NetworkError`). _(spec http-client § HttpAuthRepository; design § L3 HTTP repo)_
- [ ] Reescribir `tests/feature/L3_periphery/http/http-auth-repository.spec.ts` — 18+ tests con `HttpTestingController`. Casos: `login()` 200 → Identity alumno (Gabriel Acuña), `login()` 200 → Identity tutor (Carlos Mendoza), `login()` 401 `TENANT_AUTH_INVALID_CREDENTIALS` → `InvalidCredentialsError`, `login()` 429 → `RateLimitError`, `me()` 200 → Identity, `refresh()` 200 → Identity, `refresh()` 401 `TENANT_AUTH_REFRESH_TOKEN_INVALID` → `RefreshFailedError`, `refresh()` 401 `TENANT_AUTH_REFRESH_TOKEN_MISSING` → `RefreshFailedError`, `logout()` 204 → resuelve, `getProfile('student')` 200 → `StudentProfile`, `getProfile('tutor')` 200 → `TutorProfile`, `getProfile` 403 → `ProfileNotAvailableError`, `getProfile` 404 → `ProfileNotAvailableError`, `getProfile` 500 → `NetworkError`, prohibido leer `message` (inspección de código). _(spec http-client § Scenarios; proposal § Login response shapes confirmados)_

### L3: Interceptor credentials

- [ ] Borrar `src/L3_periphery/interceptors/auth-headers.interceptor.ts`.
- [ ] Borrar `tests/feature/L3_periphery/interceptors/auth-headers.interceptor.spec.ts`.
- [ ] Borrar `tests/feature/L3_periphery/interceptors/auth-rolling-refresh.spec.ts`.
- [ ] Crear `src/L3_periphery/interceptors/credentials.interceptor.ts` — functional interceptor `HttpInterceptorFn`. Variable módulo-level `let refreshInFlight$: Observable<void> | null = null`. Lógica: si URL no inicia con `environment.apiBaseUrl` → pass-through; si sí: clone con `{withCredentials: true}`, pipe `catchError`, si `err.status !== 401` o URL contiene `/auth/` → re-throw; si 401 en endpoint protegido → `ensureRefreshed()` con `shareReplay(1)` + `finalize(() => refreshInFlight$ = null)` → `switchMap(() => next(cloned))` → en catch de refresh: si `RefreshFailedError` → `inject(LOGOUT_USE_CASE).execute()` fire-and-forget. `inject(REFRESH_IDENTITY_USE_CASE)` directo en `ensureRefreshed()`. _(spec http-client § credentials.interceptor; design § pseudo-código interceptor)_
- [ ] Crear `tests/feature/L3_periphery/interceptors/credentials.interceptor.spec.ts` — 10 tests: request a `apiBaseUrl` lleva `withCredentials: true`, request a host externo no lleva `withCredentials`, 401 en endpoint protegido dispara refresh + retry, retry exitoso devuelve respuesta como si no hubiera 401, race condition 3 requests paralelos = 1 solo `POST /auth/refresh`, refresh falla → `RefreshFailedError` propagado, refresh falla → `logout.execute()` invocado, 401 en `/auth/refresh` no dispara nuevo refresh, 401 en `/auth/login` no dispara refresh, lock se resetea tras refresh exitoso (segundo ciclo funciona). _(spec http-client § Scenarios interceptor)_

### L3: Storage — IdentityStorage

- [ ] Renombrar `src/L3_periphery/storage/local-storage-session-storage.ts` → `src/L3_periphery/storage/local-storage-identity-storage.ts`. Reescribir para implementar `IdentityStorage`: key `lugia.identity`, serializa/deserializa `Identity`. `read()`: key ausente → null; JSON corrupto → null + delete key; shape inválido (falta `roles`, `expiresAt`, etc.) → null + delete key; key `lugia.session` legacy → ignorada, no tocar. `write()`: `JSON.stringify`. `clear()`: `localStorage.removeItem('lugia.identity')`. _(spec session-storage § LocalStorageIdentityStorage)_
- [ ] Renombrar `tests/feature/L3_periphery/storage/local-storage-session-storage.spec.ts` → `tests/feature/L3_periphery/storage/local-storage-identity-storage.spec.ts`. Reescribir con 8 tests: write + read round-trip, storage vacío → null, JSON corrupto → null + key borrada, shape inválido (sin `roles`) → null + key borrada, shape inválido (sin `expiresAt`) → null + key borrada, `lugia.session` presente pero `lugia.identity` ausente → null (sin tocar `lugia.session`), `clear()` borra la key, `clear()` sobre storage vacío no falla. _(spec session-storage § Scenarios LocalStorageIdentityStorage)_

### L3: Storage — ProfileStorage

- [ ] Crear `src/L3_periphery/storage/indexed-db-profile-storage.ts` — implementa `ProfileStorage`. Stores: `profile.student` y `profile.tutor`. Cada entrada: `{ profile, cachedAt: number }`. `read(role)`: si no existe → null; la evaluación de staleness NO se hace aquí (se delega al use case) — **corrección**: el spec session-storage dice `read stale (más de 24h) → null`, por lo que `IndexedDbProfileStorage.read()` sí evalúa si `cachedAt` está dentro de las 24h y devuelve null si está stale. TTL 24h evaluado en el storage (consistente con spec session-storage § Scenario ProfileStorage read stale). `write(role, profile)`: guarda `{ profile, cachedAt: Date.now() }`. `clear()`: borra ambos stores. _(spec session-storage § Puerto ProfileStorage; spec auth-profile § GetProfileUseCase cache TTL 24h — nota: el design pone el TTL en el use case, pero el spec session-storage pone el check de stale en el storage; implementar en ambos lados no rompe — el use case verifica `cachedAt` y el storage devuelve `null` si stale, resultado idéntico)_
- [ ] Crear `tests/feature/L3_periphery/storage/indexed-db-profile-storage.spec.ts` con `fake-indexeddb` — 6 tests: write + read student fresh → devuelve profile, write + read tutor fresh → devuelve profile, read stale (25h) → null, read miss → null, `clear()` limpia ambos roles, write sobreescribe cache anterior. _(spec session-storage § Scenarios ProfileStorage)_

### L3: Storage — IndexedDbMarkingsStorage fix layer violation

- [ ] Modificar `src/L3_periphery/storage/indexed-db-markings-storage.ts` — reemplazar la inyección de `LocalStorageSessionStorage` por el port `IdentityStorage` (inyectado por token DI). `wipeUserScope()` (sin argumento) lee `(await this.identityStorage.read())?.email ?? null`; si null → no-op; si tiene → borra solo el scope `cartilla.<email>.*`. _(spec session-storage § Requirement: MarkingsStorage depende del port IdentityStorage; design § Fix layer violation)_
- [ ] Actualizar `tests/feature/L3_periphery/storage/markings-storage.spec.ts` — reemplazar mock de `LocalStorageSessionStorage` por mock del port `IdentityStorage`. Agregar 2 tests: `wipeUserScope()` con identity null → no-op (no borra nada), `wipeUserScope()` con identity presente → borra solo el scope `cartilla.<email>.*`. _(spec session-storage § Scenario wipeUserScope sin identity)_

### L3: Guards

- [ ] Evolucionar `src/L3_periphery/guards/auth.guard.ts` — usar `GetIdentityUseCase` (inyectado) en vez de `GetActiveSessionUseCase`. Si `null` → `Router.createUrlTree(['/login'])`. Sin imports directos de storage. _(spec route-protection § authGuard)_
- [ ] Reescribir `tests/feature/L3_periphery/guards/auth.guard.spec.ts` — 4 tests: usuario autenticado → permite navegación, usuario no autenticado → redirect `/login`, el guard no importa storage directamente, guard retorna `UrlTree` (no `boolean false`). _(spec route-protection § Scenarios authGuard)_
- [ ] Evolucionar `src/L3_periphery/guards/public-only.guard.ts` — usar `GetIdentityUseCase`. Si hay identity → redirect `/${identity.role()}/home`. Si no hay → permite. _(spec route-protection § publicOnlyGuard)_
- [ ] Reescribir `tests/feature/L3_periphery/guards/public-only.guard.spec.ts` — 4 tests: sin identity → permite login, con identity student → redirect `/student/home`, con identity tutor → redirect `/tutor/home`, guard no importa storage directamente. _(spec route-protection § Scenarios publicOnlyGuard)_
- [ ] Crear `src/L3_periphery/guards/role.guard.ts` — factory `roleGuard(role: Role): CanActivateFn`. Inyecta `GetIdentityUseCase`. Sin identity → `/login`. Identity con rol incorrecto → `/${identity.role()}/home`. Rol correcto → `true`. _(spec route-protection § roleGuard)_
- [ ] Crear `tests/feature/L3_periphery/guards/role.guard.spec.ts` — 6 tests: alumno en `/student/home` → permite, alumno en `/tutor/home` → redirect `/student/home`, tutor en `/student/simulacro/:id` → redirect `/tutor/home`, sin identity en ruta de alumno → `/login`, sin identity en ruta de tutor → `/login`, factory devuelve distintas instancias por rol. _(spec route-protection § Scenarios roleGuard)_

---

> **Criterio de merge PR2**: `npm run lint` + `npm test -- --reporter=verbose tests/unit tests/feature` 100% verde. El build de la app puede fallar por LR que aún importa `LocalStorageSessionStorage`, `authHeadersInterceptor` y `GetActiveSessionUseCase` — se tolera. Antes de mergear PR2, comentar/quitar temporalmente esas referencias rotas en `app.config.ts` para que TypeScript no se queje, o fusionar PR2 + PR3 si el footprint es manejable. Estimar ~500 líneas netas en PR2.

---

## PR3 — LR Render + Infra + Docs

> Depende de PR2 mergeado. Alcance: routing, view-models, pages, app.config, build-env, docs.
> Al terminar PR3: `npm run lint` + `npm run format:check` + `npm test` + `npm run build` 100% verdes.

### LR: Routing

- [ ] Actualizar `src/LR_render/app.routes.ts` — agregar/modificar rutas:
  - `/login` con `canActivate: [publicOnlyGuard]` → `LoginPage`.
  - `/student/home` con `canActivate: [authGuard, roleGuard('student')]` → `StudentHomePage`.
  - `/student/simulacro/:id` con `canActivate: [authGuard, roleGuard('student')]` → `SimulacroPage` (existente, renombrar si se mueve la carpeta).
  - `/tutor/home` con `canActivate: [authGuard, roleGuard('tutor')]` → `TutorHomePage`.
  - `/home` (legacy) → redirect condicional: componente `HomeRedirectComponent` que en `ngOnInit` llama `GetIdentityUseCase` y navega a `/${role}/home` o `/login`.
  - `/simulacro/:id` (legacy) → `redirectTo: '/student/simulacro/:id'` con `pathMatch: 'full'` (el `roleGuard('student')` maneja el caso tutor).
  - `''` (raíz) → mantener `redirectTo: '/login'` sin cambios. **NO redirigir condicionalmente desde aquí** — el AppInitializer en `app.config.ts` navega primero. _(spec route-protection § Routing config con prefijo de rol; design § D6 y Risk #3)_
- [ ] Crear `src/LR_render/pages/home-redirect/home-redirect.component.ts` — componente simple `OnInit` que inyecta `GetIdentityUseCase` + `Router` y navega en `ngOnInit`. Sin template. Registrar en las rutas. _(spec route-protection § Redirects legacy desde /home)_
- [ ] Crear `tests/feature/LR_render/app.routes.spec.ts` o actualizar `tests/feature/LR_render/app.spec.ts` con +6 tests de routing: alumno en `/home` → `/student/home`, tutor en `/home` → `/tutor/home`, sin identity en `/home` → `/login`, `/simulacro/abc` → `/student/simulacro/abc`, alumno en `/student/home` → `StudentHomePage`, no-auth en `/student/home` → `/login`. _(spec route-protection § Scenarios routing)_

### LR: View-model Login

- [ ] Expandir `src/LR_render/view-models/login.view-model.ts` — agregar manejo de `RateLimitError`: signal `errorMessage` con texto `"Demasiados intentos, esperá un minuto"`. Post-login: navegar a `/${identity.role()}/home`. Limpiar campos tras login exitoso. _(spec auth-ui § LoginViewModel maneja RateLimitError; spec auth-ui § Login navega a /{role}/home)_
- [ ] Actualizar `tests/feature/LR_render/view-models/login.view-model.spec.ts` con +4 tests: `RateLimitError` → `errorMessage()` correcto, `RateLimitError` → botón re-habilitado, login alumno → navigate `/student/home`, login tutor → navigate `/tutor/home`. _(spec auth-ui § Scenarios LoginViewModel)_
- [ ] Actualizar `tests/feature/LR_render/pages/login/login.page.spec.ts` con +2 tests: mensaje de rate limit visible en pantalla, formulario conserva email al recibir 429. _(spec auth-ui § Scenario rate limit en login)_

### LR: StudentHomePage — refactor y perfil

- [ ] Renombrar (o actualizar in-place) `src/LR_render/view-models/home.view-model.ts` → `src/LR_render/view-models/student-home.view-model.ts`. Clase `StudentHomeViewModel`. Agregar inyección de `GetProfileUseCase`. Signals: `userName: Signal<string | null>` (skeleton null mientras carga), `userEmail: Signal<string>` (de identity.email — disponible de inmediato), `userDni: Signal<string | null>` (skeleton null mientras carga), `profileLoading: Signal<boolean>`, `profileError: Signal<'not-available' | null>`. En `start()`: disparar `getProfile.execute('student')`, actualizar signals al resolver, si `ProfileNotAvailableError` → `profileError = 'not-available'`. _(spec auth-ui § StudentHomePage muestra perfil)_
- [ ] Actualizar `tests/feature/LR_render/view-models/home.view-model.spec.ts` o crear `student-home.view-model.spec.ts` con 8 tests: perfil cargado → `userName()` = "Gabriel Acuña Acuña", `userDni()` = "79507732", skeleton durante fetch (`userName()` null), email disponible de inmediato sin esperar profile, `ProfileNotAvailableError` → degraded state (`profileError = 'not-available'`), logout invoca `LogoutUseCase`, `userDni()` viene de `profile.code` nunca de `identity.codigo`, `profileLoading` transiciona false→true→false. _(spec auth-ui § Scenarios StudentHomePage)_
- [ ] Actualizar `src/LR_render/pages/home/home.page.ts` → renombrar clase a `StudentHomePage` y actualizar selector/título. Actualizar template para usar `studentHomeViewModel`: mostrar skeleton si `profileLoading()`, mostrar `"Perfil no disponible"` si `profileError()`, mostrar nombre + email + DNI cuando disponibles. _(spec auth-ui § StudentHomePage render)_
- [ ] Actualizar `tests/feature/LR_render/pages/home/home.page.spec.ts` → actualizar a `StudentHomePage`, agregar tests: skeleton visible durante carga, `"Perfil no disponible"` visible en degraded state, nombre y DNI visibles cuando resuelto. _(spec auth-ui § Scenarios render)_

### LR: TutorHomePage (nueva)

- [ ] Crear `src/LR_render/view-models/tutor-home.view-model.ts` — clase `TutorHomeViewModel`. Inyecta `GetProfileUseCase` + `GetIdentityUseCase` + `LogoutUseCase`. Signals: `profileLoading: Signal<boolean>`, `userName: Signal<string | null>`, `userEmail: Signal<string | null>`, `userCode: Signal<string | null>` (el `profile.code` del tutor), `statsText: Signal<string | null>` (computed: `"Tenés N aulas · M alumnos"`), `hasClassrooms: Signal<boolean>`, `errorMessage: Signal<string | null>`. En `start()`: fetch profile tutor, rellenar signals. _(spec auth-ui § TutorHomePage stub; spec auth-ui § View-models exponen Signals)_
- [ ] Crear `tests/feature/LR_render/view-models/tutor-home.view-model.spec.ts` — 8 tests: perfil cargado → `userName()` = "Carlos Mendoza", `statsText()` = "Tenés 2 aulas · 120 alumnos", `hasClassrooms()` true con 2 aulas, `hasClassrooms()` false con 0 aulas (`classrooms: []`), `userCode()` = "T001", skeleton durante fetch, `ProfileNotAvailableError` → degraded state, logout invoca `LogoutUseCase`. _(spec auth-ui § Scenarios TutorHome)_
- [ ] Crear `src/LR_render/pages/tutor-home/tutor-home.page.ts` — componente standalone con template inline o archivo `.html`. Muestra: badge `"Tutor"` en header, subtítulo `"Modo tutor"`, saludo con `userName()`, email, etiqueta `"DNI / Código"` + `userCode()`, línea de stats si `hasClassrooms()`, empty state `"Aún no tenés aulas asignadas — contactá a tu administrador"` si `!hasClassrooms()`, placeholder `"Próximamente vas a gestionar tus exámenes desde acá"`, botón `"Cerrar sesión"`. _(spec auth-ui § Requirement TutorHomePage)_
- [ ] Crear `src/LR_render/pages/tutor-home/tutor-home.page.scss` — estilos para badge "Tutor", layout consistente con StudentHomePage. _(spec auth-ui § Mensajes UI en español)_
- [ ] Crear `tests/feature/LR_render/pages/tutor-home/tutor-home.page.spec.ts` — 4+ tests: badge "Tutor" visible, stats visibles con 2 aulas, empty state visible con 0 aulas, botón logout funcional. _(spec auth-ui § Scenarios TutorHome)_

### LR: AppInitializer + providers en app.config.ts

- [ ] Actualizar `src/app.config.ts` — cambios en providers:
  - **REMOVER**: `LocalStorageSessionStorage`, proveedor de `SESSION_STORAGE`, `authHeadersInterceptor`, `ActualizarBearerSiRenovadoUseCase`, `GetActiveSessionUseCase`, token `SESSION_STORAGE`.
  - **AGREGAR import** de `app.tokens.ts` para los nuevos tokens.
  - **AGREGAR**: `LocalStorageIdentityStorage` (`{ provide: IDENTITY_STORAGE, useExisting: LocalStorageIdentityStorage }`).
  - **AGREGAR**: `IndexedDbProfileStorage` (`{ provide: PROFILE_STORAGE, useExisting: IndexedDbProfileStorage }`).
  - **AGREGAR** factories para: `GetProfileUseCase`, `LoginUseCase`, `LogoutUseCase` (con todos los deps: `AUTH_REPOSITORY`, `IDENTITY_STORAGE`, `PROFILE_STORAGE`, `MARKINGS_STORAGE`, `Router`), `GetIdentityUseCase`, `RefreshIdentityUseCase` (con `REFRESH_IDENTITY_USE_CASE` token), `InitializeSessionUseCase` (con `INITIALIZE_SESSION_USE_CASE` token).
  - **AGREGAR alias**: `{ provide: LOGOUT_USE_CASE, useExisting: LogoutUseCase }`.
  - **REEMPLAZAR**: `provideHttpClient(withInterceptors([credentialsInterceptor]))`.
  - **AGREGAR**: `provideAppInitializer(async () => { const init = inject(INITIALIZE_SESSION_USE_CASE); const router = inject(Router); try { const identity = await init.execute(); void router.navigate([identity ? \`/${identity.role()}/home\` : '/login']); } catch { /* NetworkError → no navigate */ } })`.
  - Mantener `EnvioRetryDispatcher` + `provideAppInitializer` de envío pendiente. _(design § Wiring DI; spec auth-ui § AppInitializer)_
- [ ] Crear `tests/feature/app-initializer.spec.ts` — 4 tests con `TestBed`: identity válida student → navigate `/student/home`, identity válida tutor → navigate `/tutor/home`, 401 → navigate `/login`, `NetworkError` → sin navigate. _(spec auth-ui § Scenarios AppInitializer)_

### Infra: Environment y build-env

- [ ] Actualizar `.env.example` — agregar `API_BASE_URL=http://localhost:2001` y `TENANT_SLUG=vonex`. Eliminar la línea de `API_KEY`. _(design § Environment + build-env)_
- [ ] Actualizar `scripts/build-env.mjs` — agregar validación de `TENANT_SLUG` (fail-fast si falta, similar al check actual). Exponer `tenantSlug: process.env.TENANT_SLUG` en el objeto `environment`. Eliminar la generación de `apiKey`. Actualizar `API_BASE_URL` default para dev a `http://localhost:2001`. _(design § build-env cambios; spec http-client § Bootstrap registra credentialsInterceptor)_
- [ ] Verificar (no editar manualmente) los archivos generados `src/environments/environment.ts` y `environment.prod.ts` ejecutando `npm run build-env` y confirmando que tienen `{ apiBaseUrl, tenantSlug, production }` sin `apiKey`. _(design § environment.ts generado)_
- [ ] Revisar `ngsw-config.json` — confirmar que ningún `dataGroup` cachea `**/t/*/auth/**` ni `**/t/*/student/me` ni `**/t/*/tutor/me`. Si existe un `dataGroup` con patrón genérico del back, agregar exclusiones. Documentar el hallazgo en un comentario. _(design § ngsw-config.json)_

### Docs

- [ ] Actualizar `CLAUDE.md` — regla inviolable #3: cambiar "clasificación de errores HTTP por `(status, endpoint)`" a "clasificación de errores HTTP por `(status, endpoint, code)` donde `code` es el campo estructurado del response body (ej. `TENANT_AUTH_INVALID_CREDENTIALS`). El campo `message` queda prohibido para clasificación." _(spec http-client § Clasificación de errores; proposal § Decisión 4)_
- [ ] Actualizar `agents/api-contract.md` — reemplazar la sección API-FAKE con learnex: endpoints (`/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout`, `/student/me`, `/tutor/me`), headers (`withCredentials: true`, cookies HttpOnly), tabla de clasificación completa `(status, endpoint, code) → error de dominio`, credenciales seed (tutor `tutor1@vonex.pe`/`tutor123`, alumno `79507732@vonex.edu.pe`/`79507732`), nota sobre `user.id` vs `profile.id` (no intercambiar en futuros endpoints). _(proposal § Decisión 4; proposal § shapes confirmados)_
- [ ] Actualizar `agents/domain-glossary.md` — agregar términos nuevos: `Identity`, `StudentProfile`, `TutorProfile`, `TutorClassroom`, `IdentityStorage`, `ProfileStorage`, `RefreshFailedError`, `RateLimitError`, `ProfileNotAvailableError`, `InvalidIdentityError`, `tenantSlug`, `credentialsInterceptor`. Marcar como obsoletos: `Session`, `BearerToken`, `SessionStorage`, `ActualizarBearerSiRenovadoUseCase`. _(propuesta: mantener glosario actualizado igual que en Fase 2)_
- [ ] Actualizar `docs/agent-activity.md` — registrar el merge del PR3 como hito de `fase-3-login-learnex`. Indicar explícitamente que la cartilla está rota en runtime hasta `fase-3-exam-learnex`. _(design § Migration Plan paso 4)_

### Verificación PR3 (sanity checks)

- [ ] `npm run lint` — 0 violaciones. Si hay errores de import circular entre interceptor y tokens, verificar que `app.tokens.ts` no importa de `app.config.ts`.
- [ ] `npm run format:check` — 0 violaciones (aplicar `npm run format` si hay diff).
- [ ] `npm test` — 100% verde con el nuevo total. Conteo esperado: ~400 tests previos - ~40 eliminados + ~140 nuevos/reescritos = ~500 tests aprox.
- [ ] `npm run build` — bundle de producción limpio. Verificar que `environment.ts` tiene `tenantSlug` y no tiene `apiKey`.
- [ ] Verificar: `grep -r "vonex" src/` → 0 matches. Si hay matches, rastrear y reemplazar con `environment.tenantSlug`. _(spec http-client § Scenario prohibido literal slug)_
- [ ] Test manual smoke — login tutor: `tutor1@vonex.pe`/`tutor123` → `/tutor/home` con "Carlos Mendoza", "Lima 01/02", "Tenés 2 aulas · 120 alumnos". _(proposal § Profile responses shapes confirmados)_
- [ ] Test manual smoke — login alumno: `79507732@vonex.edu.pe`/`79507732` → `/student/home` con "Gabriel Acuña Acuña", email, "79507732". _(proposal § Profile responses shapes confirmados)_
- [ ] Test manual smoke — reload con cookie válida → directo a `/{role}/home` sin pasar por login. _(spec auth-ui § AppInitializer con identity válida)_
- [ ] Test manual smoke — logout → `/login`; botón back → sigue en `/login` (identity limpiada). _(spec auth-session § Scenario logout completo)_

---

> **Criterio de merge PR3**: `npm run lint` + `npm run format:check` + `npm test` + `npm run build` 100% verdes. Smoke manual de los 4 flujos anteriores pasando. Estimar ~400 líneas netas en PR3.

---

## Open questions cerradas en este change

- **Risk #1 (orden de logout)**: resuelto en `LogoutUseCase` — 8 pasos, `wipeUserScope()` (sin argumento) ANTES de `identityStorage.clear()`. El adapter lee email del port `IdentityStorage` mientras todavía existe. _(design § Risk #1; spec session-storage § wipeUserScope)_
- **Risk #2 (logout repo fail)**: resuelto con `try/catch` best-effort; limpieza local se ejecuta siempre. _(design § Risk #2)_
- **Risk #3 (redirect raíz `/`)**: resuelto manteniendo `'': redirectTo: '/login'`; el AppInitializer navega antes del primer render. _(design § D6 y Risk #3)_
- **`wipeUserScope` firma**: **sin argumento**. El adapter lee el email del port `IdentityStorage` que el use case mantiene vivo hasta el paso 5 (antes de `identityStorage.clear()` en paso 6). El port y el adapter se mantienen desacoplados del flujo del use case. _(spec session-storage § wipeUserScope; spec auth-session § LogoutUseCase orden de pasos)_
- **`inject(LogoutUseCase)` en interceptor**: el interceptor usa `inject(LOGOUT_USE_CASE)` con el `InjectionToken` definido en `app.tokens.ts`. Los use cases también usan tokens para `RefreshIdentityUseCase`. _(design § notas DI; design § pseudo-código interceptor)_

## Open questions diferidas (para próximos changes)

- **JWT TTL 15m**: conversación pendiente con learnex. Si sube a 30-60m se puede seguir sin pre-emptive timer; si queda 15m → evaluar timer en iteración posterior.
- **Endpoints learnex para examen**: bloquean `fase-3-exam-learnex`. La cartilla está rota intencionalmente hasta ese change.
- **Pre-emptive refresh timer**: depende del TTL. Postergado.
- **CORS prod allowlist**: cuando se defina dominio prod de la PWA.
- **Multi-tenant runtime**: si se requiere servir N tenants desde una build (hoy: una build = un tenant).
- **Multi-rol futuro**: si learnex agrega users con 2 roles, `Identity.role()` deja de ser invariante.
