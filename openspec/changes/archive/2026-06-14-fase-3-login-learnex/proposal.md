## Why

Lugia operó hasta hoy contra **API-FAKE** (Laravel + Sanctum, `localhost:2004/v3`), un andamiaje pensado para validar el shell de auth de Fase 1 y la cartilla de Fase 2. Ese mock siempre fue temporal: el backend real del producto es **learnex** (`localhost:2001`, slug `vonex` en path), con un modelo de auth incompatible — cookies HttpOnly + `withCredentials: true` en vez de `Authorization: Bearer` + `X-API-Key`, refresh reactivo en vez de rolling `X-New-Bearer`, multi-rol mínimo (`student`, `tutor`) en vez de un único user genérico, y endpoints de perfil separados por rol (`/student/me`, `/tutor/me`) en vez de identidad monolítica.

Hacer este cambio ahora desbloquea el resto de Fase 3 (migrar examen, dashboard del tutor, multi-aula) y elimina la deuda de mantener el adaptador FAKE en paralelo. Se ejecuta como **cut-over duro, sin feature flag**: la app está en dev y no hay usuarios productivos. La cartilla (`/home`, `/simulacro/:id`, marcaciones, queue offline, envío) **queda rota en runtime** hasta el change posterior `fase-3-exam-learnex` que migre los endpoints de examen — comportamiento aceptado por el usuario.

El contrato de auth completo está verificado contra learnex al 2026-06-13 en `.authentic/pwa-auth-contract.md`. Credenciales seed reales para dev y tests:

- Tutor: `tutor1@vonex.pe` / `tutor123`
- Alumno: `79507732@vonex.edu.pe` / `79507732`

## What Changes

### HTTP / Auth flow

- **NEW**: `POST /t/{slug}/auth/login` con `withCredentials: true`. Response setea cookies HttpOnly (`learnex_tenant_access` 15m, `learnex_tenant_refresh` 7d) + body `{user, expiresAt}`. `{slug}` viene de `environment.tenantSlug` (build-time).
- **NEW**: `GET /t/{slug}/auth/me` invocado por AppInitializer al arrancar para re-validar identity.
- **NEW**: `POST /t/{slug}/auth/logout` (204) — cleanup completo: cookies + IDB markings + outbox + profile cache + estado SW.
- **NEW**: `GET /t/{slug}/{student|tutor}/me` post-login en paralelo. Para alumno aporta `firstName`, `lastName`, `code` (DNI) y `area`. Para tutor aporta `firstName`, `lastName`, `email`, `code` (también mostrado como DNI / Código en la UI — ej. `"T001"`) y `classrooms[]` (con `id`, `code`, `name`, `modality`, `shift`, `campusName`, `cycleId`, `cycleName`, `studentCount`). Los shapes de `/student/me` y `/tutor/me` son **diferentes** — value-objects separados en L1.
- **NEW**: refresh **reactivo en 401** con lock `shareReplay(1)` en interceptor. Skip refresh si URL contiene `/auth/` (evitar loops). **Sin pre-emptive timer** (postergado hasta acordar TTL con learnex).
- **BREAKING**: muere el header `X-New-Bearer` y el rolling refresh definido en Fase 2.

### L1 Domain

- **NEW**: entidad `Identity` con `{id, tenantId, email, codigo, roles, permissions, expiresAt}`. Métodos: `isExpired(now)`, `shouldRefresh(now, thresholdMs)`, `role()` (devuelve el único rol — invariante single-role), `hasPermission(perm)`.
- **NEW**: value-objects `StudentProfile`, `TutorProfile` (shape exacta del contrato).
- **NEW**: errores `RefreshFailedError`, `RateLimitError`, `ProfileNotAvailableError`.
- **KEEP**: `InvalidCredentialsError`, `NetworkError`, `SessionExpiredError`.
- **REMOVE**: entidad `Session`, value-object `BearerToken`.
- **NEW**: puerto `IdentityStorage` (`read() | write(identity) | clear()`) que reemplaza a `SessionStorage`.
- **NEW**: puerto `ProfileStorage` (`read(role) | write(role, profile) | clear()`).
- **EVOLVE**: puerto `AuthRepository` con métodos `login()` (devuelve `Identity`), `me()`, `refresh()`, `logout()` (sin argumento), `getProfile(role)`.

### L2 Application

- **NEW**: `InitializeSessionUseCase` (AppInitializer: `repo.me()` → escribe identity → dispara `GetProfileUseCase` en paralelo → señala rol para routing).
- **NEW**: `RefreshIdentityUseCase` (`repo.refresh()` → updates identity; en `RefreshFailedError` dispara `LogoutUseCase` + redirect).
- **NEW**: `GetProfileUseCase` (cache TTL 24h en `ProfileStorage`; miss/stale → `repo.getProfile(role)` → escribe cache).
- **REWRITE**: `LoginUseCase` (devuelve `Identity`; fire-and-forget profile fetch post-login).
- **EXPAND**: `LogoutUseCase` (limpia identity + profile cache + outbox + markings; llama `repo.logout()` sin arg).
- **RENAME**: `GetActiveSessionUseCase` → `GetIdentityUseCase`.
- **REMOVE**: `ActualizarBearerSiRenovadoUseCase`.

### L3 Periphery

- **REMOVE**: `auth-headers.interceptor.ts` (Bearer + X-API-Key + X-New-Bearer rolling).
- **NEW**: `credentials.interceptor.ts` — clona toda request con `withCredentials: true` y maneja 401 reactivo vía `ensureRefreshed()` con lock `shareReplay(1)`. Salta refresh para URLs `/auth/*`.
- **REWRITE**: `HttpAuthRepository` con métodos `login`, `me`, `refresh`, `logout`, `getProfile(role)`. Nuevo shape de response.
- **REWRITE**: `LocalStorageSessionStorage` → `LocalStorageIdentityStorage` (key `lugia.identity`, shape `Identity`). Old `lugia.session` se descarta sin migrar.
- **NEW**: `IndexedDbProfileStorage` (store `profile.<role>` con `{profile, cachedAt}`, TTL 24h, invalidación en logout).
- **NEW**: `role.guard.ts` (functional guard para `/student/*` y `/tutor/*`).
- **EVOLVE**: `auth.guard.ts` usa `GetIdentityUseCase`; `public-only.guard.ts` redirige a `/{role}/home`.
- **FIX (layer violation existente)**: `IndexedDbMarkingsStorage` deja de inyectar `LocalStorageSessionStorage` directo y pasa a inyectar el port `IdentityStorage`.

### LR Render

- **NEW routing**: `/student/home`, `/student/simulacro/:id`, `/tutor/home` (stub). `/home` legacy redirige según rol. `/simulacro/:id` legacy redirige a `/student/simulacro/:id`.
- **EVOLVE `LoginViewModel`**: maneja `RateLimitError` (429 → "Demasiados intentos, esperá un minuto") y navega a `/{role}/home` según `identity.role()`.
- **EVOLVE `HomeViewModel`** (alumno): `loadUserProfile` usa `GetProfileUseCase` → `userName = ${profile.firstName} ${profile.lastName}`, `userEmail = identity.email`, `userDni = profile.code` (`StudentProfile.code` es el DNI del alumno). Hasta que el profile fetch resuelve, los campos de nombre y DNI muestran skeleton.
- **NEW `TutorHomePage`** (stub identificable visualmente como tutor):
  - Pill / badge "Tutor" en el header.
  - Subtítulo "Modo tutor".
  - Saludo `Hola, ${profile.firstName} ${profile.lastName}` + email + DNI/Código (`profile.code`, ej. `"T001"`).
  - Stats derivadas de `classrooms[]`: `"Tenés N aulas · M alumnos"` donde `N = classrooms.length` y `M = classrooms.reduce(sum, c => c.studentCount, 0)`.
  - Mensaje placeholder: "Próximamente vas a gestionar tus exámenes desde acá".
  - Botón logout.
  - Empty state: si `classrooms.length === 0` → "Aún no tenés aulas asignadas — contactá a tu administrador".
- **EVOLVE `app.config.ts`**: nuevos providers, nuevo `provideAppInitializer` que dispara `InitializeSessionUseCase`.

### Infra / Env

- **REMOVE**: `apiKey` de environment.
- **NEW**: `tenantSlug` en `environment` — viene de env var `TENANT_SLUG` (default `vonex` en `.env.example`). El slug **nunca** se hardcodea en código fuente; todas las URLs lo interpolan vía `environment.tenantSlug`. Una build = un tenant.
- **CHANGE**: `apiBaseUrl` → `http://localhost:2001` en dev.
- **UPDATE**: `scripts/build-env.mjs` para exponer `TENANT_SLUG`. `.env.example` documenta la variable con default.
- **VERIFY**: `ngsw-config.json` NO cachea `/t/{slug}/auth/*` ni `/t/{slug}/{student|tutor}/me`.
- **HTTP path builder**: nuevo helper L3 (o un constante en `environment`) que arma `/t/${environment.tenantSlug}/...` para evitar string-concat manual disperso en cada adapter.

### Docs

- Actualizar `CLAUDE.md` regla #3: clasificación de errores HTTP por `(status, endpoint, code)` — `code` viene del zod del contrato (ej. `TENANT_AUTH_INVALID_CREDENTIALS`).
- Actualizar `agents/api-contract.md` reemplazando la sección API-FAKE con learnex.

### Login response (shapes confirmados)

**Tutor**:

```json
{
  "user": {
    "id": "7526d026-7de5-4b99-bd2f-cc95b560f630",
    "email": "tutor1@vonex.pe",
    "codigo": null,
    "roles": ["tutor"],
    "permissions": ["bi:embed", "dashboard:view", "examenes:delete_pdf", "examenes:read", "examenes:read_only_pdf_upload", "examenes:write_pdf", "omr_readings:create", "omr_readings:read", "seleccion:config:read", "tutor:alerts:view", "tutor:dashboard:view", "tutor:level_candidates:view", "tutor:profile:view", "tutor:seleccion:view", "tutor:student:detail", "tutor:students:view", "tutor:syllabus:view"],
    "tenantId": "5fff5eec-34dc-40a2-b15e-10e503e7c2dc"
  },
  "expiresAt": 1781410002223
}
```

**Alumno**:

```json
{
  "user": {
    "id": "766aac21-71f9-4f48-a14a-5c2bcebc7d0b",
    "email": "79507732@vonex.edu.pe",
    "codigo": "79507732",
    "roles": ["student"],
    "permissions": ["bi:embed", "dashboard:view", "student:dashboard:view", "student:evolution:view", "student:exams:view", "student:profile:view", "student:ranking:view", "student:seleccion:view", "student:simulator:configure", "student:simulator:view", "student:syllabus:view"],
    "tenantId": "5fff5eec-34dc-40a2-b15e-10e503e7c2dc"
  },
  "expiresAt": 1781458612856
}
```

### Profile responses (shapes confirmados)

Shapes **distintos por rol** — son value-objects separados en L1.

**`GET /t/vonex/tutor/me`**:

```json
{
  "id": "19cabb89-c81d-4882-91be-3ab0e1414fae",
  "code": "T001",
  "firstName": "Carlos",
  "lastName": "Mendoza",
  "email": "tutor1@vonex.pe",
  "classrooms": [
    {
      "id": "a957e020-14d6-41fb-af47-c52531d10b41",
      "code": "LIMA0001",
      "name": "Lima 01",
      "modality": "presencial",
      "shift": "manana",
      "campusName": "Lima Cercado",
      "cycleId": "e720709f-f499-4c77-974b-a4854bdd9632",
      "cycleName": "San Marcos - Semi Anual 0326",
      "studentCount": 60
    },
    {
      "id": "5741e2db-a339-4466-99e5-1a4eb1d4339f",
      "code": "LIMA0002",
      "name": "Lima 02",
      "modality": "presencial",
      "shift": "manana",
      "campusName": "Lima San Juan De Lurigancho",
      "cycleId": "e720709f-f499-4c77-974b-a4854bdd9632",
      "cycleName": "San Marcos - Semi Anual 0326",
      "studentCount": 60
    }
  ]
}
```

Notas: `code` = código interno del tutor (no DNI). `classrooms[].studentCount` es derivado del back (no necesariamente live).

**`GET /t/vonex/student/me`**:

```json
{
  "id": "573e8dfa-faf4-4846-b05f-14143710515d",
  "code": "79507732",
  "firstName": "Gabriel",
  "lastName": "Acuña Acuña",
  "area": null
}
```

Notas: `code` = **DNI del alumno**. `area` puede ser `null` si el alumno aún no rindió ningún examen — estado válido, la UI lo trata como "Sin área asignada".

> Observación clave: `Identity.codigo` y `StudentProfile.code` pueden coincidir en valor para alumno (`"79507732"`) pero conceptualmente son cosas distintas — `Identity.codigo` es un campo del `TenantUser` que el back no garantiza estructuralmente (para tutor llega `null` en producción aunque el contrato sugiere otra cosa). La UI consume **siempre** `StudentProfile.code` para DNI.

## Decisiones arquitectónicas

1. **Cookies HttpOnly en vez de Bearer.** El token no es visible a JS — superficie XSS reducida. El browser maneja envío/recepción. Logout limpia cookies (server) + estado cliente (cookies vía `Max-Age=0`, IDB, localStorage). iOS Safari ITP purga cookies tras 7 días sin uso; mitigación UX: `autocomplete="username"` en el input email para autofill.
2. **Refresh reactivo only (sin pre-emptive timer).** Lock `shareReplay(1)` en el interceptor cubre la race condition de N requests paralelos con 401 simultáneo. El pre-emptive timer queda postergado hasta acordar con learnex un TTL adecuado (hoy 15m genera ~8 refreshes durante un examen de 2h). Documentado como open question.
3. **Routing con prefijo de rol.** `/student/*` y `/tutor/*` con `role.guard.ts`. Redirects desde `/home` y `/simulacro/:id` legacy para evitar romper bookmarks o instalaciones PWA existentes.
4. **Regla #3 (CLAUDE.md) evolucionada a `(status, endpoint, code)`.** El back ahora expone `code` estructurado del zod (ej. `TENANT_AUTH_INVALID_CREDENTIALS`, `TENANT_AUTH_REFRESH_TOKEN_INVALID`). Sigue prohibido leer `message`. El triplete da clasificación determinística sin tocar i18n del back.
5. **Single-role invariant.** El back garantiza 1 rol por user en este producto. `Identity.role()` devuelve el único; si `roles.length !== 1` se lanza `InvalidIdentityError` defensivamente. No hay switcher de rol — invariante simplifica routing, guards y UI.
6. **DNI/Código desde `Profile.code`, no desde `Identity.codigo`.** Tanto `StudentProfile.code` como `TutorProfile.code` traen el identificador a mostrar en la home (etiqueta UI: "DNI" — para alumno es DNI peruano `"79507732"`, para tutor es código interno `"T001"`; learnex unifica ambos en el campo `code`). Razones para no usar `Identity.codigo`: (a) en el login real del tutor `Identity.codigo` llega como `null` aunque el contrato sugiere otra cosa — no es confiable estructuralmente; (b) el Profile fetch siempre ocurre tras login para obtener nombre/apellido, así que `code` viene "gratis" en el mismo round-trip. La home espera al profile fetch para mostrar nombre + DNI; mientras tanto skeleton. `Identity.codigo` queda en el modelo por fidelidad al contrato pero la UI **no lo consume**.

7. **Cut-over duro sin feature flag.** API-FAKE se retira en este change. La cartilla queda rota en runtime hasta `fase-3-exam-learnex`. Aceptable porque la app está en dev. Evita el costo de mantener dos adaptadores en paralelo y forza terminar la migración rápido.
8. **Tenant slug build-time, no hardcoded.** learnex es multi-tenant — la URL `/t/{slug}/...` debe parametrizar `{slug}`. Una build de Lugia = un tenant. El slug viene de la env var `TENANT_SLUG` (default `vonex` en `.env.example`), expuesta vía `environment.tenantSlug` por `scripts/build-env.mjs`. Cualquier mención de `"vonex"` en el código fuente queda **prohibida** — sólo aparece en docs y en `.env.example` como ejemplo. Si en el futuro se requiere una sola build sirviendo múltiples tenants, la decisión cambia a runtime-by-hostname; por ahora multi-build alcanza.

## Capabilities

### New Capabilities

- `auth-profile`: endpoints `/t/{slug}/student/me` y `/t/{slug}/tutor/me`, cache en IndexedDB (`profile.<role>`) con TTL 24h, invalidación obligatoria en logout. **Shapes diferentes por rol** (value-objects separados en L1):
  - `StudentProfile`: `{id, code, firstName, lastName, area}` — `code` es el **DNI del alumno** (ej. `"79507732"`), `area` puede ser `null` si el alumno aún no rindió examen.
  - `TutorProfile`: `{id, code, firstName, lastName, email, classrooms[]}` — `code` es el código del tutor (ej. `"T001"`), mostrado en la UI con la misma etiqueta "DNI" / "Código" que el del alumno. `classrooms[]` puede ser `[]` (tutor sin aulas asignadas) → empty state en la home.
  - Distinción explícita entre `user.id` (TenantUser, del login) y `profile.id` (Student/Tutor, del endpoint de perfil) — no pasarse el equivocado a futuros endpoints.

### Modified Capabilities

- `auth-session`: **major rewrite**. Reemplaza `Session` + `BearerToken` por `Identity` con `{id, tenantId, email, codigo, roles[], permissions[], expiresAt}`. Login devuelve `Identity`, no `Session`. Agrega `InitializeSessionUseCase` (AppInitializer + `/auth/me`), `RefreshIdentityUseCase` y `GetIdentityUseCase` (renombrado de `GetActiveSessionUseCase`). Elimina `ActualizarBearerSiRenovadoUseCase` y la renovación rolling vía `X-New-Bearer`. Invariante single-role formalizado en `Identity.role()`.
- `auth-ui`: **expand**. Maneja `RateLimitError` (429) en LoginViewModel. Navega a `/{role}/home` post-login según `identity.role()`. AppInitializer dispara `InitializeSessionUseCase` al arrancar. Nueva `TutorHomePage` stub. `HomePage` del alumno consume `GetProfileUseCase` y muestra `firstName + lastName + email + codigo (DNI)`.
- `session-storage`: **rewrite**. Renombre conceptual: `IdentityStorage` reemplaza `SessionStorage`. Nueva key `lugia.identity`, shape `Identity`. Old `lugia.session` se descarta sin migrar.
- `http-client`: **rewrite**. `withCredentials: true` global vía `credentials.interceptor.ts`. Refresh reactivo en 401 con lock `shareReplay(1)`, skip para `/auth/*`. Eliminados headers `Authorization: Bearer` y `X-API-Key`. Eliminada lectura de `X-New-Bearer`. Clasificación de errores HTTP por `(status, endpoint, code)` — nunca por `message`.
- `route-protection`: **expand**. Nuevo `role.guard.ts` para `/student/*` y `/tutor/*`. `auth.guard.ts` consume `GetIdentityUseCase`. `public-only.guard.ts` redirige a `/{role}/home` según rol activo. Redirects legacy desde `/home` y `/simulacro/:id`.

### Unchanged capabilities (recordatorio)

- `exam-list`, `exam-marking`, `exam-submission`, `offline-storage`, `connectivity-indicator`, `server-time-sync`, `design-tokens`: NO cambian a nivel de spec. Quedan **rotas en runtime** hasta `fase-3-exam-learnex`. La fix de layer violation en `IndexedDbMarkingsStorage` (inyectar `IdentityStorage` en vez de `LocalStorageSessionStorage`) es implementation detail y no toca specs de `offline-storage`.

## Impact

### Plan de migración / cut-over

> **Aviso explícito**: tras mergear este change, la cartilla queda **rota en runtime** (la app no podrá listar simulacros del día ni enviar marcaciones contra learnex hasta que `fase-3-exam-learnex` migre `GET /v3/simulacros` y `POST /v3/simulacros/:id/envio` a sus equivalentes learnex). El login y la home stub funcionan; la grilla A–E no. Aceptado por el usuario.

Orden de implementación recomendado:

1. **L1 Domain**: `Identity`, `StudentProfile`, `TutorProfile`, errores nuevos, ports `IdentityStorage` y `ProfileStorage`, port `AuthRepository` evolucionado. Eliminar `Session`, `BearerToken`.
2. **L2 Application**: `InitializeSessionUseCase`, `RefreshIdentityUseCase`, `GetProfileUseCase`. Rewrite `LoginUseCase`. Expand `LogoutUseCase`. Rename `GetActiveSessionUseCase` → `GetIdentityUseCase`. Eliminar `ActualizarBearerSiRenovadoUseCase`.
3. **L3 Periphery**: `credentials.interceptor.ts`, rewrite `HttpAuthRepository`, `LocalStorageIdentityStorage`, `IndexedDbProfileStorage`, `role.guard.ts`. Eliminar `auth-headers.interceptor.ts`. Fix `IndexedDbMarkingsStorage` para inyectar `IdentityStorage`.
4. **LR Render**: routing `/student/*` y `/tutor/*`, redirects legacy, `LoginViewModel` (429 + role-based navigate), `HomeViewModel` (alumno), `TutorHomePage` stub, `app.config.ts` providers + `provideAppInitializer`.
5. **Infra / Env**: `apiBaseUrl=http://localhost:2001`, `tenantSlug` inyectado desde `TENANT_SLUG` env var (default `vonex`), eliminar `apiKey`. Actualizar `build-env.mjs`, `.env.example`. Helper path builder L3 para `/t/${slug}/...`. Verificar `ngsw-config.json` con `{slug}` parametrizado.
6. **Tests**: ~15 borrados/reescritos (entidad `Session`, `BearerToken`, `auth-headers.interceptor`, `ActualizarBearerSiRenovado`), ~10 nuevos (`Identity`, `Initialize`, `Refresh`, `GetProfile`, `credentials.interceptor`, `role.guard`, `IndexedDbProfileStorage`), ~50 ajustados (mocks de `AuthRepository`, view-models, guards). Detalle exhaustivo en design phase.
7. **Docs**: `CLAUDE.md` regla #3, `agents/api-contract.md` sección learnex.

### Riesgos y mitigaciones

| Riesgo | Likelihood | Mitigación |
|---|---|---|
| iOS Safari ITP purga cookies tras 7 días de inactividad → user vuelve a login siempre | Med | Documentado y aceptado. `autocomplete="username"` en input email para autofill nativo. Sin password autofill. |
| Service Worker no puede leer cookies HttpOnly → no sabe si user está logueado | Med | El SW maneja sólo assets + outbox; auth queda 100% en main thread. Verificar `ngsw-config.json` no cachea `/auth/*` ni `/{role}/me`. |
| Race condition: N requests paralelos devuelven 401 simultáneo → N refreshes | High | Lock `ensureRefreshed()` con `shareReplay(1)` + `finalize` que reset el lock. Pattern del contrato. |
| Confusión `user.id` (TenantUser) vs `profile.id` (Student/Tutor) → pasar el equivocado a futuros endpoints de examen | Med | Documentar en `agents/api-contract.md` y `domain-glossary.md`. `Identity.id` y `Profile.id` son types diferentes a nivel TS. |
| Tests rotos durante la migración (los 50 ajustados) | High | Estrategia de cadena: L1 → L2 → L3 → LR. Cada layer se valida antes de pasar al siguiente. CI verde en cada layer. |
| Cartilla rota en runtime tras mergear y antes de `fase-3-exam-learnex` | Alta (intencional) | Aceptado por el usuario. La app está en dev. Coordinar que `fase-3-exam-learnex` arranque inmediatamente después. |
| Old `lugia.session` queda huérfana en localStorage de devs/testers | Low | El nuevo flow ignora la key. Opcionalmente `IdentityStorage.read()` puede borrar `lugia.session` defensivamente la primera vez. |
| CORS dev: `app.enableCors({ origin: true, credentials: true })` ya permite cualquier origin en learnex local — sin acción | Low | Verificar al levantar `localhost:2001` y `localhost:4200` juntos. Prod allowlist queda como open question. |
| JWT TTL 15m genera ~8 refreshes durante examen 2h → ruido en logs y posible visibilidad en devtools | Low | Documentado. Open question: pedir a learnex subir a 30-60m. No bloquea este change. |

### Open questions (no bloquean aprobación; flags para próximos changes)

- **JWT 15m TTL**: ¿pedir al equipo de learnex subir `JWT_EXPIRES_IN` a 30-60m para reducir refresh-noise durante exámenes largos?
- **Endpoints learnex para exam**: aún sin especificar. Bloquean `fase-3-exam-learnex`. Coordinar contrato similar al que está en `.authentic/pwa-auth-contract.md`.
- **CORS prod allowlist**: cuando se defina el dominio prod del PWA (¿`m.vonex.edu.pe`?), pedir a learnex pasar de `origin: true` a allowlist explícita. Cookies `SameSite=None; Secure` confirmadas en prod.
- **Pre-emptive refresh timer**: postergado hasta acordar TTL. Si learnex sube a 30-60m podría seguir sin timer; si queda 15m conviene evaluar reintroducirlo para no depender 100% de 401-driven refresh durante navegación intensiva.
- **Multi-rol futuro**: si learnex agrega users con `roles: ['tutor', 'student']` (caso documentado en el contrato), `Identity.role()` deberá dejar de ser invariante y aparecerá un switcher. Por ahora fuera de scope.
- **Multi-tenant runtime**: si en el futuro se decide servir múltiples tenants desde una sola build (en vez de una build por tenant), `tenantSlug` pasa a resolverse por hostname al arrancar. Por ahora fuera de scope — una build = un tenant.

### Fuera de scope

- Pre-emptive refresh timer (decisión postergada).
- Endpoints de examen learnex (cartilla queda rota — change posterior `fase-3-exam-learnex`).
- Tutor flow real (aulas, activación de examen, dashboard). Sólo stub.
- Multi-rol switcher (invariante single-role).
- Profesor/teacher (no aplica al producto por ahora).
- Migración de datos legacy de localStorage (cut-over directo, `lugia.session` se descarta).
- I18n del back (sigue prohibido leer `message`; `code` cubre la clasificación).

### Próximos pasos

- `sdd-spec` (deltas para `auth-session`, `auth-ui`, `session-storage`, `http-client`, `route-protection` + spec nueva `auth-profile`) y `sdd-design` (detalle técnico de `Identity`, interceptor con lock, storage cache, redirects legacy, plan de tests) pueden correr en paralelo.
- Luego `sdd-tasks` con forecast de presupuesto de PR (este change es grande — probable que recomiende slicing en chained PRs: L1+L2 / L3 / LR + infra / docs+tests).
- Luego `sdd-apply` por slices.
