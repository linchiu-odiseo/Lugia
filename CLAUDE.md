# Lugia — guía para Claude Code

> Esta nota la lee Claude Code al arrancar en este repo. Resume el proyecto, el stack y las reglas para que cualquier sesión (humana o agente) pueda colaborar sin pedir contexto desde cero.

## Qué es esto

**Lugia** es una PWA Angular para móviles que sirve como **cartilla virtual de marcaciones** para simulacros (exámenes de práctica). El alumno marca las alternativas A–E por pregunta en pantalla; el enunciado viene impreso en una hoja física que entrega el profesor. Backend: **learnex** (NestJS + Postgres, multi-tenant) en Docker. Auth via cookies HttpOnly + `withCredentials: true`.

**Fase actual: Fase 3 — migración a learnex EN CURSO.** Cambio activo `fase-3-login-learnex` (sin archivar todavía): cut-over duro de API-FAKE (Bearer + X-API-Key) a learnex (cookies HttpOnly + `withCredentials: true`). Multi-rol mínimo: alumno rinde, tutor stub identificable. Refresh reactivo con lock `shareReplay(1)`. Cartilla queda **rota en runtime** hasta el change siguiente `fase-3-exam-learnex`.

Fase 2 archivada (2026-06-12): cartilla completa con grilla A–E offline-first, queue IDB, server-time-sync, bearer rolling 6h vía `X-New-Bearer`. 400/400 tests.

Fase 1 archivada (2026-06-11): login funcional + redirect a `/home` protegido por guard.

**Fase 3 (próximos pasos):** después de `fase-3-login-learnex`: `fase-3-exam-learnex` (migrar endpoints de examen para restaurar la cartilla). Posibles changes posteriores: dashboard tutor real (aulas, activación de examen), resultados post-envío, historial, anti-fraude hardening.

## Stack

- Angular **22+** standalone components, Signals, Reactive Forms (sin NgModules, sin Karma, sin async pipe para estado del view-model).
- TypeScript estricto.
- Vitest vía `@angular/build:unit-test`.
- ESLint flat config + Prettier.
- Hexagonal estricta en 4 capas: `L1_domain`, `L2_application`, `L3_periphery`, `LR_render`.
- PWA mobile-lite: manifest + `@angular/service-worker` (shell cacheado en producción).
- IndexedDB para marcaciones y cola de envíos offline (`fake-indexeddb` en tests).

## Estructura del repo

```
Lugia/
├── src/
│   ├── L1_domain/          dominio puro (entidades, value-objects, ports, errores)
│   ├── L2_application/     use cases puros
│   ├── L3_periphery/       adapters Angular (HTTP, storage, interceptors, guards)
│   ├── LR_render/          UI Angular (pages, components, view-models con Signals)
│   ├── environments/       generado por scripts/build-env.mjs (NO editar a mano)
│   ├── app.config.ts       wiring DI raíz
│   ├── main.ts, index.html, styles.scss
├── tests/
│   ├── unit/               L1 + L2 (Vitest puro, sin Angular)
│   └── feature/            L3 + LR (Vitest + jsdom + TestBed)
├── agents/                 docs READ BY subagentes (ver abajo)
├── docs/                   guías humanas (follow-ups, decisiones de Fase 2)
├── tools/-mcp/             MCP servers / dev tooling
├── scripts/                build-env.mjs
├── openspec/               specs y cambios (SDD workflow)
├── .claude/agents/         definiciones de subagentes (frontend-builder, etc.)
├── eslint.config.js, angular.json, tsconfig*.json
├── .env.example            variables documentadas (committed)
└── .env                    valores reales locales (ignorado)
```

## Comandos comunes

```bash
npm run dev            # arranca dev server en http://localhost:4200 (preflight: build-env)
npm test               # corre Vitest (single shot, watch mode con ng test directo)
npm run lint           # ng lint sobre src/ y tests/
npm run format         # Prettier write
npm run format:check   # Prettier check (CI)
npm run build          # bundle producción (preflight: build-env)
npm run build-env      # genera src/environments/ desde .env (manual; se invoca por hooks)
```

## Reglas inviolables

1. **Boundaries hexagonales.** Ver `@agents/architecture-rules.md` para la tabla completa. ESLint enforza los imports cruzados; el subagente `hexagonal-guard` audita lo que ESLint no atrapa (anémicas, mappers ceremoniales, use cases passthrough).
2. **L1 y L2 son TypeScript puro.** Cero `@angular/*`, cero `rxjs`, cero browser APIs.
3. **Clasificación de errores HTTP por `(status, endpoint, code)` — nunca por texto del `message`.** El `code` se lee SOLO si está declarado en el zod del contrato learnex (ej. `TENANT_AUTH_INVALID_CREDENTIALS`, `TENANT_AUTH_REFRESH_TOKEN_INVALID`, `TENANT_AUTH_REFRESH_TOKEN_MISSING`). El `message` es texto humano volátil y queda PROHIBIDO. Detalle en `@agents/api-contract.md`.
4. **Cookies HttpOnly + `withCredentials: true` vía un único interceptor** en `src/L3_periphery/interceptors/credentials.interceptor.ts`. El interceptor agrega `withCredentials` a toda request a `apiBaseUrl` y maneja refresh reactivo en 401 con lock `shareReplay(1)`. Cero `Authorization: Bearer`, cero `X-API-Key`, cero `X-New-Bearer` (todo eso era API-FAKE).
5. **Strings de UI en español (es-PE), hardcoded en Fase 1+. I18n diferida. Código en inglés.**
6. **Tenant slug parametrizado, jamás hardcoded.** El slug (`vonex` para Vonex) viene de `environment.tenantSlug` generado desde `TENANT_SLUG` en `.env` por `scripts/build-env.mjs`. Todas las URLs `/t/{slug}/...` se arman vía el helper `src/L3_periphery/http/api-paths.ts`. Cualquier mención literal de `"vonex"` en `src/` está prohibida.

## Referencias para subagentes

- `@agents/api-contract.md` — endpoints, headers, mapeo HTTP→errores de dominio.
- `@agents/architecture-rules.md` — reglas de import por capa, antipatrones, checklist de PR.
- `@agents/coding-style.md` — naming, organización, comentarios, convención de commits quirúrgicos.
- `@agents/domain-glossary.md` — vocabulario de producto y de arquitectura.

## Subagentes definidos

- **`frontend-builder`** — implementa LR_render (componentes, view-models, routing). Usa cuando hay que crear/modificar UI Angular.
- **`hexagonal-guard`** — auditor read-only de boundaries. Usa antes de cerrar un cambio o periódicamente sobre `src/`.
- **`test-engineer`** — escribe tests Vitest. Usa después de implementar una entidad/use case/componente.

Definiciones completas en `.claude/agents/`.

## Workflow de cambios (SDD)

Este proyecto usa **OpenSpec / Spec-Driven Development**. Un cambio (`openspec/changes/<name>/`) contiene `proposal.md`, `design.md`, `specs/`, `tasks.md`. Se navega con skills:

- `/openspec-propose <idea>` — crea propuesta + specs + tasks de un tirón.
- `/openspec-apply-change <name>` — implementa tasks marcando checklist.
- `/openspec-archive-change <name>` — finaliza y mueve a `openspec/changes/archive/`.

El cambio activo actual es `cartilla-fase-2` (todas las capabilities implementadas, queda solo `sdd-verify` + `sdd-archive`).

## Información del entorno dev

- **learnex** (back real) corre en Docker en `http://localhost:2001`. Multi-tenant: el slug viaja en el path `/t/{slug}/...`. Slug actual de dev: `vonex` (definido en `.env`).
- **API-FAKE retirado** (cambio `fase-3-login-learnex`). Si encontrás referencias a `localhost:2004/v3`, `API_KEY`, `X-API-Key`, `Authorization: Bearer`, `X-New-Bearer`, son legacy y deben migrarse.
- **Credenciales seed de dev**:
  - Alumno: `79507732@vonex.edu.pe` / `79507732`.
  - Tutor: `tutor1@vonex.pe` / `tutor123`.
- **`.env`** tiene solo `API_BASE_URL` y `TENANT_SLUG`. Si faltan, el dev server falla en el hook `predev` con mensaje claro.
- **Plataforma de dev**: Windows + PowerShell. Comandos POSIX vía Bash tool funcionan; usar `/` en paths.
