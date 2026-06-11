# NeonPanda — guía para Claude Code

> Esta nota la lee Claude Code al arrancar en este repo. Resume el proyecto, el stack y las reglas para que cualquier sesión (humana o agente) pueda colaborar sin pedir contexto desde cero.

## Qué es esto

**NeonPanda** es una PWA Angular para móviles que sirve como **cartilla virtual de marcaciones** para simulacros (exámenes de práctica). El alumno marca las alternativas A–E por pregunta en pantalla; el enunciado viene impreso en una hoja física que entrega el profesor. Backend: **API-FAKE** (Laravel + Sanctum + Postgres) en Docker, editable.

**Fase actual: Fase 2 (cartilla)** — `/home` muestra la lista de simulacros del día con countdown server-anchored, polling 120s y refresh por focus. `/simulacro/:id` permite marcar A–E sobre una grilla offline-first. Envío con auto-envío a T=0 (jitter ±3s) y retry automático en cola IndexedDB. Bearer rolling 6h vía `X-New-Bearer`.

Fase 1 (archivada): login funcional + redirect a `/home` protegido por guard. Specs en `openspec/specs/auth-*`, `openspec/specs/http-client`, `openspec/specs/route-protection`, `openspec/specs/session-storage`.

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
NeonPanda/
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
3. **Clasificación de errores HTTP por (status, endpoint) — nunca por texto del mensaje.** API-FAKE devuelve mensajes distintos para 401 y pueden cambiar sin aviso. Detalle en `@agents/api-contract.md`.
4. **Bearer + X-API-Key vía un único interceptor** en `src/L3_periphery/interceptors/auth-headers.interceptor.ts`. No armes esos headers en ningún otro lado.
5. **Strings de UI en español (es-PE), hardcoded en Fase 1.** I18n diferida. Código en inglés.

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

- **API-FAKE** corre en Docker en `http://localhost:2004/v3`. Usuario único de prueba: `fulano@panda.test` / `12345678`.
- **API_KEY** real vive en `.env` (no committeada). Si falta, el dev server falla en el hook `predev` con mensaje claro.
- **Plataforma de dev**: Windows + PowerShell. Comandos POSIX vía Bash tool funcionan; usar `/` en paths.
