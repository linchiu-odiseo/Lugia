# API-FAKE — Contrato consumido por NeonPanda

> **Fuente de verdad para subagentes** (`frontend-builder`, `test-engineer`).
> Cualquier adapter en `src/L3_periphery/http/` debe cumplir este contrato.
> El histórico de cómo se acordó vive en `openspec/changes/add-auth-login/api-contract-request.md` (Fase 1) y `openspec/changes/cartilla-fase-2/design.md` (Fase 2).

## Resumen ejecutivo

API-FAKE es un servicio Laravel + Sanctum + Postgres que corre en Docker en la máquina dev. Expone endpoints bajo el prefijo `/v3`:
- **Auth (Fase 1):** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- **Cartilla (Fase 2):** `GET /simulacros`, `POST /simulacros/:id/envio`.

Cada request DEBE incluir `X-API-Key`; los endpoints protegidos además requieren `Authorization: Bearer`.

## Valores de entorno

| Variable        | Origen              | Dev                                                  |
|-----------------|---------------------|------------------------------------------------------|
| `API_BASE_URL`  | `.env` → `environment.apiBaseUrl` | `http://localhost:2004/v3`              |
| `API_KEY`       | `.env` → `environment.apiKey`     | (ver `.env`, no se lista aquí)         |

Usuario de prueba único en dev: `fulano@panda.test` / `12345678`.

## Headers

### Request

| Header              | Cuándo                                       | Valor                          |
|---------------------|----------------------------------------------|--------------------------------|
| `X-API-Key`         | TODO request a `API_BASE_URL`                | `environment.apiKey`           |
| `Authorization`     | Solo si hay sesión activa (`Session` válida) | `Bearer <bearerToken>`         |
| `Content-Type`      | Requests con body                            | `application/json`             |
| `Accept`            | Todos                                        | `application/json`             |

### Response (Fase 2)

| Header              | Cuándo                                                | Significado                              |
|---------------------|-------------------------------------------------------|------------------------------------------|
| `X-New-Bearer`      | Cualquier respuesta autenticada cuando TTL del bearer baja del umbral (≈ 2h restantes de los 6h nominales) | Reemplazar bearer actual por este valor sin que el alumno lo note |

Inyección centralizada en `src/L3_periphery/interceptors/auth-headers.interceptor.ts`. **Ningún otro código** del proyecto debe armar estos headers manualmente. El mismo interceptor extrae `X-New-Bearer` de las respuestas y dispara `ActualizarBearerSiRenovadoUseCase` fire-and-forget para persistir el bearer rotado.

## Endpoints

### `POST /auth/login` — público

Request body:
```json
{ "email": "fulano@panda.test", "password": "12345678" }
```

Response 200:
```json
{
  "token": "6|lP2nsQrVOVEVEFlWhiTf0Iw6ksZTsQTh29kWHrbgae8bc16e",
  "user": { "email": "fulano@panda.test", "name": "fulano Demo" }
}
```

Response 401: credenciales inválidas o `X-API-Key` ausente/inválida. Body: `{ "message": "<string>" }` (texto variable, NO matchear).

### `POST /auth/logout` — protegido

Sin body. Response 204 No Content. El token Sanctum queda revocado server-side.

### `GET /auth/me` — protegido

Sin body. Response 200:
```json
{ "user": { "email": "fulano@panda.test", "name": "fulano Demo" } }
```

Response 401: token expirado/revocado. Trigger para logout silencioso + redirect a `/login`.

### `GET /simulacros` — protegido (Fase 2)

Sin body. Response 200:
```json
{
  "serverTime": "2026-06-12T08:15:05-05:00",
  "simulacros": [
    {
      "id": "uuid-or-string",
      "area": "Matemática",
      "name": "Simulacro 03 — Razonamiento",
      "count": 20,
      "inicio": "2026-06-12T08:00:00-05:00",
      "fin":    "2026-06-12T09:00:00-05:00",
      "estado": "pendiente | abierto | enviado | cerrado"
    }
  ]
}
```

- `serverTime` es la hora del backend al momento de la respuesta. La PWA computa `offset = serverTime - clientTime` y la mantiene en `Clock` para anclar countdowns y bloqueos de entrada.
- `estado` es derivado por backend en cada GET (no almacenado como columna). El cliente NO lo recomputa.
- **Backend garantiza no-overlap**: a lo más un simulacro con `estado: "abierto"` simultáneo por alumno. Si llegan dos, el cliente loguea warning y los acepta ambos (Requirement 4 con degradación graceful).
- Response 401 → `SessionExpiredError`. Response 5xx / network → `NetworkError`.

### `POST /simulacros/:id/envio` — protegido (Fase 2)

Request body:
```json
{
  "answers": { "1": "C", "2": "A", "3": null, "4": "B", ..., "20": "E" },
  "clientSubmittedAt": "2026-06-12T08:47:00-05:00"
}
```

- `answers`: keys strings numéricos "1"…"count". Values "A"|"B"|"C"|"D"|"E"|null. Backend valida `length === count`.
- `clientSubmittedAt`: ISO8601 que define el "tiempo de término". Backend valida `inicio ≤ clientSubmittedAt ≤ fin`. **Se confía en el cliente** (threat model documentado en `design.md` Decision 2).

Responses:

| Status | Body                                                              | Cuándo                                              |
|--------|-------------------------------------------------------------------|-----------------------------------------------------|
| `200`  | `{ status: "enviado", clientSubmittedAt, serverReceivedAt }`      | Aceptado dentro de ventana                          |
| `409`  | `{ status: "enviado", clientSubmittedAt, serverReceivedAt }`      | Ya envió antes (idempotencia; cliente lo trata como éxito) |
| `400`  | `{ message, code: "INVALID_TIME" }`                               | `clientSubmittedAt` fuera de `[inicio, fin]`        |
| `400`  | `{ message, code: "INVALID_SHAPE" }`                              | shape de answers inválido                           |
| `403`  | `{ message, code: "CLOSED" }`                                     | Simulacro ya cerrado terminal                       |
| `404`  | `{ message }`                                                     | Simulacro no asignado a este usuario                |
| `401`  | `{ message }`                                                     | Bearer expirado/inválido                            |

## Mapeo HTTP → errores de dominio (L3 → L1)

| Origen                                                  | Error L1 emitido               | Mensaje UI                                          |
|---------------------------------------------------------|--------------------------------|-----------------------------------------------------|
| `POST /auth/login` → `401`                              | `InvalidCredentialsError`      | "Credenciales inválidas"                            |
| `POST /auth/login` → `5xx` o network                    | `NetworkError`                 | "No se pudo conectar al servidor. Inténtalo de nuevo." |
| Cualquier endpoint protegido → `401`                    | `SessionExpiredError` + logout silencioso | "Sesión expirada, inicia sesión nuevamente." |
| `POST /auth/logout` → cualquier error                   | (best-effort, sin error)       | n/a (logout local procede igual)                    |
| `GET /simulacros` → `5xx` o network                     | `NetworkError`                 | "No se pudo conectar al servidor"                   |
| `GET /simulacros` → DTO con `estado` fuera del set      | `InvalidSimulacroError`        | (bug de backend; raro)                              |
| `POST /simulacros/:id/envio` → `200` o `409`            | (éxito — 409 colapsa por idempotencia) | "Enviado a las HH:MM"                       |
| `POST /simulacros/:id/envio` → `400` + `INVALID_TIME`   | `InvalidSubmissionTimeError`   | (error operacional + redirect /home)                |
| `POST /simulacros/:id/envio` → `400` + `INVALID_SHAPE`  | `InvalidPayloadError`          | "Hubo un error inesperado, intenta de nuevo"        |
| `POST /simulacros/:id/envio` → `400` sin `code`         | `InvalidPayloadError` (default) | (defensa)                                          |
| `POST /simulacros/:id/envio` → `403` + `CLOSED`         | `SimulacroCerradoError`        | "Este simulacro ya cerró"                           |
| `POST /simulacros/:id/envio` → `404`                    | `SimulacroNoAsignadoError`     | (refresca /home)                                    |
| `POST /simulacros/:id/envio` → `5xx` o network          | `NetworkError` (use case encola y devuelve `status: "queued"`) | "Pendiente de envío — se enviará cuando vuelva la red" |

**Regla crítica:** clasificar SIEMPRE por `(status code, endpoint, code)`, NUNCA por el campo `message` del body. Backend usa al menos 3 strings distintos para 401 y pueden cambiar sin aviso.

## CORS

API-FAKE responde con `Access-Control-Allow-Origin: *`. El dev server Angular (`http://localhost:4200`) está cubierto sin configuración extra.

## Comportamientos confirmados en dev

- Token Sanctum es **revocado server-side** en logout (verificado: `/auth/me` con token post-logout devuelve 401 `"Unauthenticated."`).
- Fase 1: sin política de expiración configurada (token longevo hasta logout explícito).
- Fase 2: TTL nominal de 6h con renovación rolling vía `X-New-Bearer`. Implementación exacta del umbral depende del backend.
- Sin rate limit en dev (cliente polling cada 120s desde `/home` → manejable para el caso esperado).

## Fuera de contrato

- Refresh tokens dedicados (Fase 2 usa renovación rolling vía header).
- Registro, recuperación de contraseña, MFA.
- Endpoints de calificaciones, resultados, historial post-envío (Fase 2.x o posterior).
- Cancelación o modificación de envío después del POST.
