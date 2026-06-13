## Why

Fase 1 dejó al alumno logueado en `/home`, pero la PWA no hace nada productivo todavía. **Fase 2 entrega la funcionalidad central del producto**: que el alumno marque sus simulacros del día desde el celular, durante la ventana horaria asignada, con tolerancia a pérdida de red. Sin esto, Lugia no resuelve el problema real (cartilla virtual de marcaciones para simulacros). Lo construimos ahora porque ya existe el shell de autenticación y el contrato con el equipo de backend está acordado y locked.

## What Changes

- **NEW**: pantalla `/home` muestra la lista de simulacros del día con su estado (`pendiente | abierto | enviado | cerrado`), refrescada por focus + polling 120s + pull-to-refresh.
- **NEW**: pantalla `/simulacro/:id` con grilla de bubbles A–E (sin enunciado, está en papel), navegación entre simulacros activos, persistencia local de marcaciones.
- **NEW**: envío al backend vía `POST /v3/simulacros/:id/envio` con `clientSubmittedAt` que define el "tiempo de término" del examen (se confía en el cliente para esto).
- **NEW**: auto-envío silencioso a T=0 con jitter ±3s para mitigar thundering herd cuando 20k alumnos terminan a la misma hora.
- **NEW**: persistencia offline-first en IndexedDB (marcaciones + cola de envíos pendientes) scopeada por usuario, con clear automático en logout.
- **NEW**: indicador de conectividad (badge verde/rojo) basado en `navigator.onLine`.
- **NEW**: sincronización de tiempo con el backend (`serverTime` en cada GET) para countdowns server-anchored.
- **MODIFIED**: bearer rolling refresh — el backend incluye `X-New-Bearer` en respuestas cuando el TTL del actual baja del umbral; el interceptor lo persiste sin que el alumno note nada.
- **BREAKING (backend contract)**: nuevos endpoints `GET /v3/simulacros` y `POST /v3/simulacros/:id/envio` que el equipo de API-FAKE debe implementar siguiendo el contrato locked en `design.md`.

## Capabilities

### New Capabilities

- `exam-list`: lista de simulacros del día con derivación de estado (`pendiente | abierto | enviado | cerrado`) basada en `serverTime`, refresh on focus + polling 120s + pull-to-refresh.
- `exam-marking`: UI de cartilla con grilla de bubbles A–E, navegación entre simulacros activos, persistencia inmediata por marca, recuperación al reabrir.
- `exam-submission`: envío al backend con `clientSubmittedAt`, mapeo HTTP→errores de dominio, auto-envío T=0 con jitter ±3s, retry cuando vuelve la red.
- `offline-storage`: puerto `MarkingsStorage` en L1 + adapter `IndexedDbMarkingsStorage` en L3, claves scopeadas por `userEmail`, wipe en logout.
- `connectivity-indicator`: signal global `isOnline` derivado de `navigator.onLine` y eventos `online`/`offline`, expuesto a la UI como badge.
- `server-time-sync`: captura del `serverTime` en cada GET, cómputo de `offset = serverTime - clientTime`, exposición de countdowns server-anchored al resto de la app.

### Modified Capabilities

- `auth-session`: bearer rolling refresh — la sesión se renueva cuando el backend envía `X-New-Bearer` en cualquier respuesta autenticada. TTL nominal 6h, renovación automática en cada GET /simulacros mientras el alumno tenga la app abierta.

## Impact

- **Código nuevo**:
  - `src/L1_domain/`: entidades `Simulacro`, `Marcacion`, value-objects `EstadoSimulacro`, `ClientSubmittedAt`, puertos `SimulacrosApi`, `MarkingsStorage`, `Clock`, `Connectivity`.
  - `src/L2_application/`: use cases `ObtenerSimulacrosDelDia`, `MarcarRespuesta`, `EnviarSimulacro`, `RetomarEnvioPendiente`, `ProgramarAutoEnvio`.
  - `src/L3_periphery/`: `HttpSimulacrosApi`, `IndexedDbMarkingsStorage`, `ServerAnchoredClock`, `BrowserConnectivity`, interceptor extendido para `X-New-Bearer`.
  - `src/LR_render/pages/`: `HomePage` extendida, `SimulacroPage` nueva. View-models con Signals.
- **Tests**: cobertura `tests/unit/` (L1+L2 puros) y `tests/feature/` (L3+LR con jsdom).
- **Backend (API-FAKE)**: nuevos endpoints documentados en `agents/api-contract.md`. Lo entrega el equipo de backend siguiendo este contrato.
- **PWA shell**: manifest mobile-lite + service worker básico desde día 1 (per [[feedback-workflow-discipline]]).
- **Sin breaking changes en código existente** — Fase 1 sigue funcionando idéntico, solo se extienden specs.
