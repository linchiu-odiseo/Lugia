# Glosario de dominio — NeonPanda

> Vocabulario compartido por código, tests y conversaciones del equipo.
> Si un término no está acá, no es de dominio: probablemente es de framework, infraestructura o convención de código (ver `architecture-rules.md` / `coding-style.md`).

## Términos del producto

**Cartilla (de marcaciones)** — Hoja de respuestas virtual. El producto. En Fase 1 es un placeholder; en Fase 2 se vuelve una grilla interactiva donde el alumno marca alternativas A–E por pregunta.

**Simulacro** — Examen de práctica organizado por la academia. La cartilla se asocia a un simulacro. Tiene cantidad fija de preguntas (5, 10 o 20 — configurable). Tiene una ventana de tiempo definida por el profesor.

**Alternativa** — Una de las 5 opciones de respuesta (A, B, C, D, E) por pregunta. La cartilla NO muestra el enunciado de la pregunta; ese viene impreso en la hoja física que el profesor entrega.

**Marcación** — Acto del alumno de seleccionar una alternativa. Es reversible (puede cambiar) hasta el envío final. La marcación se almacena localmente hasta que el alumno envía la cartilla completa.

**Envío** — Acto único e irreversible de cerrar la cartilla y enviar las marcaciones al backend. Una cartilla enviada no puede modificarse.

## Términos de identidad y sesión

**Usuario** — Alumno autenticado. Identidad mínima en Fase 1: `email` + `name`.

**Sesión (Session)** — Entidad de dominio (L1) que representa un usuario autenticado activo. Contiene `bearerToken`, `userEmail`, `issuedAt`. Una sola sesión activa simultánea por dispositivo. Persistida en `localStorage` bajo la clave `neonpanda.session`.

**Bearer token (BearerToken)** — Value-object L1. Es un Sanctum personal access token devuelto por `POST /auth/login`. String opaco. No tiene expiración configurada en API-FAKE (Fase 1 asume longevo hasta logout explícito).

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

## Errores de dominio

**`InvalidCredentialsError`** — Login rechazado por credenciales incorrectas (HTTP 401 en `POST /auth/login`). UI: "Credenciales inválidas".

**`NetworkError`** — Falla de transporte o respuesta 5xx. UI: "No se pudo conectar al servidor. Inténtalo de nuevo."

**`InvalidSessionError`** — Datos persistidos corruptos o sesión inválida en construcción (ej: bearer vacío). NO se muestra al usuario; el código de L3 limpia el storage y procede como "sin sesión".
