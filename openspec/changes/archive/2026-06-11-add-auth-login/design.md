## Context

NeonPanda parte de cero: no hay código previo, ni siquiera un `package.json`. Este cambio establece simultáneamente (a) el primer flujo funcional del producto y (b) los cimientos arquitectónicos que toda la base de código heredará. API-FAKE corre en Docker en la PC del usuario, expone `POST /auth/login` (Sanctum bearer) y exige `X-API-Key` en cada request por middleware. El usuario tiene cero experiencia previa en Angular pero conoce arquitectura limpia y SDD, y quiere verificar el flujo localmente antes de avanzar a Fase 2 (cartilla).

## Goals / Non-Goals

**Goals:**
- Levantar la PWA en `localhost`, autenticarse contra API-FAKE, redirigir a `/home`, sobrevivir refresh y poder cerrar sesión.
- Imponer hexagonal estricta `L1_domain` → `L2_application` → `L3_periphery` ← `LR_render` desde el primer archivo.
- Auth (bearer + api-key) encapsulado en un único interceptor; LR y L2 nunca conocen detalles HTTP.
- View-models 100% Signals; templates leen signals directos, sin `async pipe` ni subscriptions manuales.
- ESLint + Prettier con regla de import-boundary que falla CI si L1/L2 importan Angular o HTTP.
- Tres subagentes (`frontend-builder`, `hexagonal-guard`, `test-engineer`) operativos con system prompts en `.claude/agents/`.
- Convención de commits quirúrgicos aplicada desde el bootstrap.

**Non-Goals:**
- Refresh tokens (Sanctum personal access tokens son de larga duración).
- Manejo avanzado de errores de red (retry, backoff, telemetría).
- Soporte offline para login (un login requiere conectividad por definición).
- i18n (mensajes hardcoded en es-PE en Fase 1, refactor a futuro).
- Recuperación de contraseña, registro, MFA.
- Service worker / instalación PWA (eso entra en Fase 2 junto con offline).
- Cualquier feature de cartilla (Fase 2).

## Decisions

### D1: Arquitectura hexagonal estricta con nombres `L1/L2/L3/LR`

```
src/
├── L1_domain/         entidades, value-objects, ports, errors (TypeScript puro)
├── L2_application/    use cases (TypeScript puro)
├── L3_periphery/      http, storage, interceptors, guards (Angular adapters)
└── LR_render/         pages, components, view-models (Angular UI)
```

**Reglas de dependencia (enforcement vía ESLint `import/no-restricted-paths`):**
- L1 no importa nada del proyecto
- L2 importa solo L1
- L3 importa L1 (implementa puertos); puede usar Angular
- LR importa L2 y L1; nunca L3 directamente — las implementaciones se inyectan vía provider tokens

**Alternativa considerada:** convención laxa `core/feature/shared`. **Descartada** porque (a) el usuario explícitamente pidió arquitectura estricta, (b) Fase 2 introduce dos implementaciones del mismo puerto (Http vs Hybrid+IndexedDB) y hexagonal lo hace trivial, (c) tests rápidos sobre L1+L2 sin Angular.

### D2: Bootstrap con Angular CLI estándar, no esquema custom

`ng new neonpanda --standalone --routing --style=scss --strict --skip-tests=false`

Luego se reorganiza el `src/` generado en las 4 carpetas. `app/` desaparece — su contenido se distribuye entre `LR_render/` y configuración raíz.

**Alternativa considerada:** Nx workspace. **Descartada** para MVP: agrega curva de aprendizaje innecesaria cuando el usuario está aprendiendo Angular base.

### D3: Test framework — Jest para L1/L2/LR

Karma+Jasmine es el default de Angular CLI pero es lento y el ecosistema migra a Jest/Vitest. Para hexagonal estricta el grueso de tests vive en L1/L2 (TypeScript puro), donde Jest brilla y no requiere bootstrap Angular.

- L1 + L2: Jest puro (~milisegundos por suite).
- LR: Jest + `@analogjs/vitest-angular` o `jest-preset-angular` para tests de componentes.
- Coverage objetivo: L1 ≥ 90%, L2 ≥ 80%, LR ≥ 60% (en LR pesan más tests E2E manuales en MVP).

**Alternativa considerada:** Vitest. **Descartada por ahora** porque la integración con Angular sigue siendo experimental; revaluar cuando salga soporte oficial.

### D4: Almacenamiento del bearer — `localStorage` con caveat documentado

El bearer + email del usuario se persisten en `localStorage` bajo la clave `neonpanda.session`. Se acepta el riesgo XSS (Phase 1, app interna, sin contenido inyectable de terceros).

**Mitigaciones:**
- CSP estricta (`default-src 'self'`) en `index.html`.
- Ningún `innerHTML` ni `bypassSecurityTrust*` en LR.
- ESLint regla `@angular-eslint/no-bypass-security-trust` activa.

**Alternativa considerada:** Cookie httpOnly. **Descartada** porque API-FAKE devuelve el token en el body de `POST /auth/login` (patrón Sanctum SPA con bearer), no `Set-Cookie`. Cambiar eso pediría modificar API-FAKE y complicaría CORS.

### D5: Headers `Authorization` + `X-API-Key` vía un único interceptor

`L3_periphery/interceptors/auth-headers.interceptor.ts`:
- Lee `X-API-Key` desde `environment.apiKey` (build-time) e inyecta en TODO request hacia `environment.apiBaseUrl`.
- Lee el bearer desde el `SessionStorage` y lo inyecta como `Authorization: Bearer <token>` SOLO si hay sesión activa.
- Para requests cuya URL no coincide con `apiBaseUrl` (futuras integraciones externas), el interceptor es no-op.

**Alternativa considerada:** dos interceptors separados. **Descartada** por simplicidad; ambos headers tienen el mismo trigger (request hacia API-FAKE).

### D6: Variables de entorno vía `environment.ts`, no `.env` runtime

Angular no lee `.env` en runtime por defecto. Se usan los archivos `src/environments/environment.ts` (dev) y `environment.production.ts` (build prod), poblados desde `.env` con `dotenv-cli` + script `scripts/build-env.ts` ejecutado pre-build.

`.env.example` documenta las variables esperadas. `.env` está en `.gitignore`.

**Alternativa considerada:** `window.__env` cargado de `assets/env.js`. **Considerada para Fase 2** si se requiere cambiar config sin rebuild (típico en despliegues multi-cliente). Por ahora rebuild es aceptable.

### D7: Bootstrap de Angular standalone + Signals + Reactive Forms

- `main.ts` usa `bootstrapApplication(AppComponent, appConfig)`.
- `appConfig` provee `provideRouter(routes)`, `provideHttpClient(withInterceptors([authHeadersInterceptor]))`.
- Ningún `NgModule`. Todos los componentes `standalone: true`.
- Estado reactivo en view-models con `signal()`, `computed()`, `effect()`.
- Formularios con `ReactiveFormsModule` (importado directo en cada componente que lo use). RxJS se tolera donde Angular lo exige (Reactive Forms valueChanges, HttpClient observables), pero LR convierte a Signals con `toSignal()` lo antes posible.

### D8: Subagentes en `.claude/agents/`

Cada subagente es un `.md` con frontmatter (`name`, `description`, `tools`) + system prompt:

- `frontend-builder.md`: implementa LR (componentes, view-models, routing). Conoce Signals, standalone, control flow `@if/@for`, Reactive Forms. Tools: `Read, Edit, Write, Grep, Glob, Bash`.
- `hexagonal-guard.md`: auditor read-only. Verifica que L1 no importe nada, L2 solo L1, L3 implemente ports sin filtrar Angular a L1/L2. Tools: `Read, Grep, Glob`.
- `test-engineer.md`: escribe tests unit (Jest L1/L2) y feature (componentes LR). Tools: `Read, Edit, Write, Bash`.

`agents/` (no `.claude/agents/`) contiene documentación de dominio que los subagentes referencian: `domain-glossary.md`, `architecture-rules.md`, `coding-style.md`, `api-contract.md`. `CLAUDE.md` raíz los enlaza con `@agents/...`.

### D9: Convención de commits quirúrgicos

Cada commit cubre un único concern (una entidad L1, o un use case L2, o un componente LR + su test). Mensaje:

```
<type>(<layer>): <subject ≤72 chars>

<cuerpo: por qué, scope, decisiones no obvias>

Refs: openspec/changes/add-auth-login (task <n>)
```

`type` ∈ `feat | fix | refactor | docs | test | chore | build`.
`layer` ∈ `L1 | L2 | L3 | LR | infra | docs`.

Documentado en `agents/coding-style.md` y enforced por convención (sin commit-msg hook en Fase 1 — se evalúa para Fase 2).

## Risks / Trade-offs

- **[XSS roba el bearer de localStorage]** → CSP estricta, ESLint contra `bypassSecurityTrust*`, sin contenido de terceros. Aceptado para MVP interno; se reevalúa antes de exponer la PWA externamente.
- **[Token Sanctum sin expiración real → sesión "zombie"]** → En cada arranque de la app, si hay sesión persistida, se hace una llamada ligera (`GET /auth/me` si API-FAKE lo expone; ver Open Question) para validar. Si falla, se limpia la sesión.
- **[Bootstrap Angular + reorganización a L1/L2/L3/LR puede romper convenciones del CLI]** → Se documentan los moves en commit dedicado; tests de smoke (`ng test`, `ng build`) deben pasar antes de continuar.
- **[Hexagonal estricta sobre 2 pantallas se siente sobre-ingenieriado]** → Asumido conscientemente: el costo inicial paga en Fase 2 (offline = segunda implementación del mismo puerto). Riesgo: anti-patrones (entidades anémicas, mappers ceremoniales) — se vigilan vía `hexagonal-guard`.
- **[Usuario sin Angular previo + 4 capas + Signals = curva fuerte]** → `agents/architecture-rules.md` con ejemplos comentados, `domain-glossary.md` y revisión de PRs por `frontend-builder` mitigan.
- **[Jest + Angular 17 standalone tiene fricción de setup]** → Si en bootstrap el setup de Jest se vuelve un sumidero >2h, fallback a Karma+Jasmine para LR (mantener Jest puro para L1/L2). Decisión registrada en commit del bootstrap.

## Migration Plan

No aplica — primera versión. El cambio se considera revertible eliminando la rama; no hay datos en producción.

**Rollback local:** eliminar `src/` y archivos de bootstrap regenera el estado anterior.

## Open Questions

Los endpoints de API-FAKE para autenticación NO existen aún. El frontend redacta el contrato deseado en `openspec/changes/add-auth-login/api-contract-request.md` y lo entrega al equipo backend para que abra los endpoints. Las preguntas abajo son las que el documento de contrato lleva explícitas a backend; los **defaults asumidos** sirven para no bloquear el diseño mientras backend responde.

1. **Identidad: `email` vs `username`?** Default asumido: `email`.
2. **Shape de la respuesta de login:** `{ token, user: { email, name } }`? Default asumido: sí.
3. **Expiración del Sanctum token:** ¿finita o longeva? Default asumido: longeva, sin refresh token.
4. **`POST /auth/logout` server-side disponible?** Default asumido: sí; si no, logout es local-only y este punto se documenta como deuda.
5. **`GET /auth/me` disponible para validar sesión al arrancar?** Default asumido: sí (recomendado pero no bloqueante); si no, sesión persistida se asume válida hasta primer 401 en request privado.
6. **Rate limit en `/auth/login`?** Default asumido: no en dev; la PWA maneja 429 igual con mensaje genérico.
7. **API key estática por entorno?** Default asumido: una por entorno, leída de `.env`.

Resolución registrada en el cambio: tareas 1.2 → 1.3 → 1.5 del `tasks.md` (entrega → respuestas → promoción a `agents/api-contract.md`).
