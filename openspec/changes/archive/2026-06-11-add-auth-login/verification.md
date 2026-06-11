# Verification — add-auth-login (Fase 1)

**Fecha:** 2026-06-11
**Operador:** usuario (manual browser E2E) + Claude Code (checks automáticos)
**Entorno:** Windows 11, Chrome DevTools, API-FAKE en Docker en `http://localhost:2004/v3`, PWA en `http://localhost:4200` via `npm run dev`.
**Credenciales:** `fulano@panda.test` / `12345678`.

## Resumen

**Cambio APROBADO para archive.** 64/64 tareas completadas, 78/78 tests pasando, lint limpio, build prod sin warnings, hexagonal-guard veredicto APROBADO, 9/9 verificaciones manuales E2E pasaron.

## Checks automáticos (sección 8.1–8.4)

| # | Check | Comando | Resultado |
|---|---|---|---|
| 8.1 | Lint | `npm run lint` | `All files pass linting.` (0 errores, 0 warnings) |
| 8.2 | Tests | `npm test` | `14 passed (14)` test files, `78 passed (78)` tests, ~1.8s. Cobertura formal por capa diferida (Vitest projects mode pendiente — ver `docs/phase-2-followups.md`). |
| 8.3 | Hexagonal-guard | Subagente sobre `src/` | **APROBADO** — 18 archivos, 0 críticas, 0 smells. L1 puro (sin Angular/rxjs/browser), L2 puro, L3 sin LR, LR solo guards de L3 (excepción documentada en `agents/architecture-rules.md`). |
| 8.4 | Build prod | `npm run build` | Initial 64.90 kB transfer, lazy chunks login-page 10.33 kB y home-page 1.12 kB. Sin warnings, sin errores. Sub-presupuesto (warning a 500 kB). |

## Verificación manual E2E (sección 8.5–8.13)

Todos los 9 pasos del checklist resultaron ✅ en el browser del usuario.

| # | Escenario | Resultado observado |
|---|---|---|
| 8.5 | Login con credenciales válidas | Redirige a `/home`, saludo con email correcto. |
| 8.6 | Refresh en `/home` | Sesión preservada, no redirige a `/login`. |
| 8.7 | Logout desde `/home` | `neonpanda.session` desaparece de `localStorage`, navega a `/login`. |
| 8.8 | Acceso directo a `/home` sin sesión | `authGuard` redirige a `/login`. |
| 8.9 | Acceso directo a `/login` con sesión | `publicOnlyGuard` redirige a `/home`. |
| 8.10 | Credenciales inválidas | Mensaje "Credenciales inválidas", password limpio, email conservado, botón habilitado. |
| 8.11 | API-FAKE caído | Mensaje "No se pudo conectar al servidor. Inténtalo de nuevo." |
| 8.12 | Headers en requests a API-FAKE | Todos incluyen `X-API-Key`; post-login además `Authorization: Bearer <token>`. |
| 8.13 | Headers en requests al dev server | NO incluyen `X-API-Key` (interceptor filtra correctamente por `apiBaseUrl`). |

## Cobertura del contrato — specs vs. implementación

Los 5 spec files de `openspec/changes/add-auth-login/specs/` definen escenarios Given/When/Then. Cada uno mapea a uno o más tests automatizados y/o pasos del E2E manual:

- **`auth-session/spec.md`** — Login exitoso, credenciales inválidas, error de red, una sola sesión, logout, recuperación de sesión, integridad de `Session`. Cubierto por tests L1 (`session.spec.ts`, `bearer-token.spec.ts`, `errors.spec.ts`), L2 (`login.use-case.spec.ts`, `logout.use-case.spec.ts`, `get-active-session.use-case.spec.ts`).
- **`auth-ui/spec.md`** — Form reactivo con validación, navegación post-login, mensajes legibles tras error, shell de `HomePage`, Signals en view-models, strings es-PE. Cubierto por `login.page.spec.ts`, `home.page.spec.ts` + E2E manual 8.5, 8.7, 8.10, 8.11.
- **`http-client/spec.md`** — Inyección automática de `X-API-Key` siempre y `Authorization: Bearer` cuando hay sesión, `HttpAuthRepository` con mapeo DTO/error, configuración HTTP centralizada, prohibido `fetch` directo. Cubierto por `http-auth-repository.spec.ts`, `auth-headers.interceptor.spec.ts` + E2E 8.12, 8.13.
- **`route-protection/spec.md`** — Rutas protegidas exigen sesión, rutas públicas accesibles sin login (excepto si ya hay sesión), raíz redirige según estado, guard depende de use case no de storage. Cubierto por `auth.guard.spec.ts`, `public-only.guard.spec.ts` + E2E 8.5, 8.6, 8.8, 8.9.
- **`session-storage/spec.md`** — Persistencia entre recargas, aislamiento tras puerto, integridad del JSON, clave estable `neonpanda.session`. Cubierto por `local-storage-session-storage.spec.ts` + E2E 8.6, 8.7.

## Decisiones registradas durante apply

1. **Vitest, NO Jest** (deviación de design D3): Angular 22 ya integra Vitest vía `@angular/build:unit-test`. `jest-preset-angular` está siendo abandonado.
2. **Projects split (unit/feature) diferido** a Fase 2 — bleeding edge en Angular 22, no aporta valor con 1 sola spec al inicio.
3. **L3 puede importar L2** (relajamiento de regla inicial): guards consumen use cases L2 — pattern hexagonal legítimo (adapter orquestador).
4. **LR puede importar guards de L3** (excepción documentada): guards son flow control de routing, no implementaciones de ports. NO puede importar adapters HTTP/storage.
5. **Clasificación de errores HTTP por (status, endpoint)** — backend usa al menos 3 strings distintos para 401 (`"API key invalida o ausente."`, `"Credenciales invalidas"`, `"Unauthenticated."`). Pattern matching sobre el mensaje sería frágil.
6. **`scripts/build-env.mjs` (no `.ts`)** — un script de 70 líneas sin deps externas no justifica añadir transpilador.
7. **CSP con `connect-src` hardcoded a `localhost:2004`** para Fase 1 — prod via HTTP header desde el servidor (registrado en `docs/phase-2-followups.md`).
8. **`Session.isExpired()` retorna `false` siempre** en Fase 1 — Sanctum tokens longevos en API-FAKE, método existe como punto de extensión para Fase 2.

## Métricas de salida

- **Líneas de código (aprox., excluyendo tests):** ~600 (L1: 130, L2: 90, L3: 280, LR: 250, app.config: 65, infra scripts: 80).
- **Tests:** 78 (L1: 28, L2: 16, L3: 26, LR: 11, App shell: 2).
- **Bundle prod:** 64.90 kB transferred initial + 11.45 kB lazy total.
- **Commits Fase 1:** 9 (1 initial de ng new + 8 surgicales por capa/sección — ver `git log`).
- **Cobertura de subagentes ejecutados:** hexagonal-guard 1 vez (vía general-purpose, ~$1.03 / 34,340 tokens / 98s) — registrado en `docs/agent-activity.md`.

## Lo que queda fuera de Fase 1 (referencia)

Ver `docs/phase-2-followups.md` para los 18 follow-ups conocidos. Resumen de los principales:

- Refresh tokens / política de expiración real
- Validación de sesión vía `/auth/me` al startup
- Vitest projects split + coverage thresholds enforced
- CSP de producción via HTTP header
- Service worker + offline (IndexedDB SessionStorage)
- i18n (de hardcoded es-PE a `$localize` o similar)
- Cartilla de marcaciones (Fase 2 funcional)
