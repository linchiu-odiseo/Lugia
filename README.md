# Lugia

PWA Angular para cartilla de marcaciones de simulacros. Fase 1 (login + home protegido) → Fase 2 (cartilla offline-capable). Backend: API-FAKE (Laravel + Sanctum + Postgres) en Docker.

## Quickstart

```bash
# 1. Clonar e instalar
git clone <repo-url>
cd Lugia
npm install

# 2. Configurar variables
cp .env.example .env
# Editar .env: pegar la API_KEY real (pedirla al equipo backend si no la tienes)

# 3. Levantar API-FAKE en otra terminal
# (ver instrucciones del repo API-FAKE; debe quedar en http://localhost:2004)

# 4. Arrancar el dev server
npm run dev
# Abre http://localhost:4200/login y entra con:
#   email:    fulano@panda.test
#   password: 12345678
```

## Comandos

| Comando                | Qué hace                                                     |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Dev server en `http://localhost:4200` (preflight: build-env) |
| `npm test`             | Vitest sobre `tests/`                                        |
| `npm run lint`         | ESLint flat config sobre `src/` y `tests/`                   |
| `npm run format`       | Prettier write                                               |
| `npm run format:check` | Prettier check (CI-friendly)                                 |
| `npm run build`        | Bundle producción en `dist/` (preflight: build-env)          |
| `npm run build-env`    | Regenera `src/environments/` desde `.env`                    |

## Estructura

```
src/
├── L1_domain/         dominio puro (entidades, value-objects, ports, errores)
├── L2_application/    use cases puros
├── L3_periphery/      adapters Angular (HTTP, storage, interceptors, guards)
├── LR_render/         UI: pages, components, view-models con Signals
├── environments/      generado por scripts/build-env.mjs (NO editar a mano)
├── app.config.ts, main.ts, index.html, styles.scss
tests/
├── unit/              L1 + L2 (Vitest puro)
└── feature/           L3 + LR (Vitest + jsdom + TestBed)
agents/                docs leídos por subagentes Claude Code
.claude/agents/        definiciones de subagentes (frontend-builder, hexagonal-guard, test-engineer)
openspec/              specs y cambios (SDD workflow)
scripts/build-env.mjs  generador de environment.ts desde .env
```

## Arquitectura

Hexagonal estricta en 4 capas. Las reglas de import están enforzadas por ESLint (`import-x/no-restricted-paths` + `no-restricted-imports`). Detalle: [`agents/architecture-rules.md`](agents/architecture-rules.md).

## Stack

- **Angular 22+** standalone components, Signals, Reactive Forms.
- **TypeScript** estricto.
- **Vitest** vía `@angular/build:unit-test`.
- **ESLint** flat config + **Prettier**.

## Variables de entorno

| Variable       | Origen | Ejemplo dev                     |
| -------------- | ------ | ------------------------------- |
| `API_BASE_URL` | `.env` | `http://localhost:2004/v3`      |
| `API_KEY`      | `.env` | `apifake_<provided-by-backend>` |

`.env` está en `.gitignore`. Documentación de variables en `.env.example`.

## Documentación interna

- [`CLAUDE.md`](CLAUDE.md) — guía para Claude Code (incluye comandos y reglas inviolables).
- [`agents/api-contract.md`](agents/api-contract.md) — contrato vigente con API-FAKE.
- [`agents/architecture-rules.md`](agents/architecture-rules.md) — reglas hexagonales + antipatrones.
- [`agents/coding-style.md`](agents/coding-style.md) — naming, comentarios, commits.
- [`agents/domain-glossary.md`](agents/domain-glossary.md) — vocabulario.
- [`openspec/changes/`](openspec/changes/) — propuestas, specs y tasks de cada cambio.

## Workflow

SDD (Spec-Driven Development) con OpenSpec. Cada cambio vive en `openspec/changes/<name>/` con `proposal.md`, `design.md`, `specs/`, `tasks.md`. Se navega con skills `/openspec-propose`, `/openspec-apply-change`, `/openspec-archive-change`.

## Fase actual

**Fase 1 — Autenticación.** Cambio activo: `openspec/changes/add-auth-login/`. Login funcional contra API-FAKE + redirect a `/home` protegido por guard, sin cartilla todavía. Persistencia de sesión en `localStorage` con CSP estricta como mitigación XSS.

Fase 2 (más adelante): la cartilla (5/10/20 preguntas configurables, marcaciones reversibles, offline vía IndexedDB, envío único final).
