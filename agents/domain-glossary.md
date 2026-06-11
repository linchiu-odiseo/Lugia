# Glosario de dominio — NeonPanda

> Vocabulario compartido por código, tests y conversaciones del equipo.
> Si un término no está acá, no es de dominio: probablemente es de framework, infraestructura o convención de código (ver `architecture-rules.md` / `coding-style.md`).

## Términos del producto

**Cartilla (de marcaciones)** — Hoja de respuestas virtual. El producto. En Fase 1 es un placeholder; en Fase 2 se vuelve una grilla interactiva donde el alumno marca alternativas A–E por pregunta.

**Simulacro** — Examen de práctica organizado por la academia. La cartilla se asocia a un simulacro. Tiene cantidad fija de preguntas (5, 10 o 20 — configurable). Tiene una ventana de tiempo definida por el profesor.

**Alternativa** — Una de las 5 opciones de respuesta (A, B, C, D, E) por pregunta, o `null` (desmarcado). Value-object L1 con factory `Alternativa.fromString(raw)` y `Alternativa.desmarcada()`. La cartilla NO muestra el enunciado de la pregunta; ese viene impreso en la hoja física que el profesor entrega.

**Marcación (Marcacion)** — Entidad L1 `(simulacroId, pregunta, alternativa)`. Acto del alumno de seleccionar una alternativa. Es reversible (puede cambiar, puede desmarcar) hasta el envío. Se almacena en `MarkingsStorage` scopeado por `userEmail` en IndexedDB.

**Envío** — Acto de mandar las marcaciones al backend. Único e idempotente. Una cartilla enviada no puede modificarse (backend devuelve 409 en intentos repetidos, que el cliente trata como éxito).

**Estado del simulacro (EstadoSimulacro)** — Value-object L1 con 4 valores: `pendiente | abierto | enviado | cerrado`. Derivado por backend en cada GET (no almacenado como columna). El cliente NO lo recomputa.

**Tiempo de término (clientSubmittedAt)** — Timestamp del momento en que el alumno terminó el simulacro (apretó Enviar o llegó T=0). Lo aporta el cliente y se confía. Backend valida que caiga en `[inicio, fin]`.

**Tiempo de envío (serverReceivedAt)** — Timestamp del momento en que el backend recibió el POST. Auditoría. NO afecta el estado del examen.

**Server time (ServerTime)** — Value-object L1 con timestamp ISO8601. Cada GET `/simulacros` retorna `serverTime` que el cliente ancla al `Clock` para todos los countdowns y bloqueos de entrada (evita ataque "cambiar hora del celular").

**Auto-envío T=0** — Envío automático silencioso programado para `simulacro.fin` con jitter ±3s. `clientSubmittedAt` SIEMPRE = `simulacro.fin` exacto, independiente de cuándo dispare el timer.

**Cola de envíos pendientes** — Si el POST falla por `NetworkError`, el envío queda en `MarkingsStorage` con su `clientSubmittedAt` original. El `EnvioRetryDispatcher` global despacha la cola al arrancar la app y en cada transición a online del puerto `Connectivity`.

## Términos de identidad y sesión

**Usuario** — Alumno autenticado. Identidad mínima en Fase 1: `email` + `name`.

**Sesión (Session)** — Entidad de dominio (L1) que representa un usuario autenticado activo. Contiene `bearerToken`, `userEmail`, `issuedAt`. Una sola sesión activa simultánea por dispositivo. Persistida en `localStorage` bajo la clave `neonpanda.session`.

**Bearer token (BearerToken)** — Value-object L1. Sanctum personal access token devuelto por `POST /auth/login`. String opaco. En Fase 2 tiene TTL nominal de 6h con renovación rolling vía header `X-New-Bearer` en respuestas autenticadas. Si el backend lo incluye, el interceptor dispara `ActualizarBearerSiRenovadoUseCase` silenciosamente.

**API key (X-API-Key)** — Header estático por entorno que identifica a la app cliente ante API-FAKE. NO es secreto de usuario; es secreto de aplicación. Vive en `.env` (build-time), nunca en código de dominio.

**Principal** — Identificador legible del dueño de la sesión (en Fase 1: el `email`). Método `Session.principal()` lo devuelve para UI.

## Términos arquitectónicos (resumen — detalle en `architecture-rules.md`)

**L1 — Dominio** (`src/L1_domain/`) — TypeScript puro: entidades con comportamiento, value-objects, puertos (interfaces), errores tipados. Cero imports de Angular, RxJS, browser.

**L2 — Aplicación** (`src/L2_application/`) — Casos de uso. Orquestan el dominio. TypeScript puro. Importan solo L1.

**L3 — Periferia** (`src/L3_periphery/`) — Adaptadores: implementaciones HTTP, storage, guards, interceptors. Implementan puertos L1. Pueden importar Angular.

**LR — Render** (`src/LR_render/`) — UI Angular: pages, components, view-models con Signals. Importan L1+L2. NUNCA importan L3 directamente — la inyección viene por provider tokens en `src/app.config.ts`.

**Puerto (Port)** — Interface declarada en L1 que describe una capacidad sin comprometerse con una implementación. Ej: `AuthRepository`, `SessionStorage`. Permite que Fase 2 reemplace la implementación HTTP por una híbrida (HTTP + IndexedDB) sin tocar L1/L2.

**Adapter** — Implementación concreta de un puerto, vive en L3. Ej: `HttpAuthRepository`, `LocalStorageSessionStorage`.

**Use case** — Función o clase en L2 que orquesta uno o más puertos para cumplir una acción del producto. Ej: `LoginUseCase`, `LogoutUseCase`, `GetActiveSessionUseCase`.

**View-model** — Objeto en LR que expone estado reactivo (Angular Signals) a una página o componente. Aísla el template del cableado contra use cases. Ej: `LoginViewModel`.

## Puertos nuevos en Fase 2

**`Clock`** — Puerto L1 server-anchored. `now()` devuelve la hora actual ajustada por `offset = serverTime - clientTime` capturado en el último GET. `setServerTime(ServerTime)` actualiza el offset. Adapter L3: `ServerAnchoredClock`.

**`Connectivity`** — Puerto L1 reactivo. `current(): boolean` da el snapshot, `subscribe(listener): unsubscribe` notifica transiciones. Adapter L3: `BrowserConnectivity` con `navigator.onLine` + eventos `online`/`offline`.

**`MarkingsStorage`** — Puerto L1 para persistencia local de marcaciones y cola de envíos. El adapter L3 (`IndexedDbMarkingsStorage`) deriva el `userEmail` de la sesión activa internamente — los métodos del puerto NO lo reciben. Wipe automático en logout vía `wipeUserScope()`.

**`SimulacrosApi`** — Puerto L1 para el backend de simulacros. `obtenerDelDia()` y `enviar(req)`. Adapter L3: `HttpSimulacrosApi`.

## Errores de dominio

**`InvalidCredentialsError`** — Login rechazado por credenciales incorrectas (HTTP 401 en `POST /auth/login`). UI: "Credenciales inválidas".

**`NetworkError`** — Falla de transporte o respuesta 5xx. UI: "No se pudo conectar al servidor. Inténtalo de nuevo."

**`InvalidSessionError`** — Datos persistidos corruptos o sesión inválida en construcción (ej: bearer vacío). NO se muestra al usuario; el código de L3 limpia el storage y procede como "sin sesión".

**`SessionExpiredError`** — Endpoint protegido respondió 401 mid-operación. Dispara logout silencioso + redirect a `/login`. Se distingue de `InvalidCredentialsError` (solo aplica a login).

**`InvalidServerTimeError`** — `ServerTime` recibido del backend no es ISO8601 parseable. Bug de backend; raramente visible al usuario.

**`InvalidSimulacroError`** — Entidad `Simulacro` o VO `EstadoSimulacro` rechazada en construcción (campos inválidos, fin ≤ inicio, estado fuera del set, etc.).

**`InvalidAlternativaError`** — VO `Alternativa` rechazado (string fuera de A–E).

**`InvalidMarcacionError`** — Entidad `Marcacion` rechazada (simulacroId vacío, pregunta no entero positivo).

**`OfflineStorageUnavailableError`** — IndexedDB no disponible en el browser. UI: banner persistente "Tu navegador no soporta marcaciones offline" + bloqueo de entrada a simulacros.

**`InvalidSubmissionTimeError`** — Backend rechaza POST porque `clientSubmittedAt` cae fuera de `[inicio, fin]`. UI: error operacional + redirect `/home`.

**`InvalidPayloadError`** — Backend rechaza POST por shape inválido (count no cuadra, alternativas fuera de A–E|null). Bug del cliente. UI: "Hubo un error inesperado, intenta de nuevo."

**`SimulacroCerradoError`** — Backend reporta que el simulacro ya está cerrado. UI: "Este simulacro ya cerró" + redirect `/home`.

**`SimulacroNoAsignadoError`** — Backend reporta 404. UI: refrescar `/home` (el simulacro fue retirado o el id es stale en cola).
