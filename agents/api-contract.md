# API-FAKE — Contrato consumido por NeonPanda

> **Fuente de verdad para subagentes** (`frontend-builder`, `test-engineer`).
> Cualquier adapter en `src/L3_periphery/http/` debe cumplir este contrato.
> El histórico de cómo se acordó vive en `openspec/changes/add-auth-login/api-contract-request.md`.

## Resumen ejecutivo

API-FAKE es un servicio Laravel + Sanctum + Postgres que corre en Docker en la máquina dev. Expone tres endpoints de autenticación bajo el prefijo `/v3`. Cada request DEBE incluir `X-API-Key`; los endpoints protegidos además requieren `Authorization: Bearer`.

## Valores de entorno

| Variable        | Origen              | Dev                                                  |
|-----------------|---------------------|------------------------------------------------------|
| `API_BASE_URL`  | `.env` → `environment.apiBaseUrl` | `http://localhost:2004/v3`              |
| `API_KEY`       | `.env` → `environment.apiKey`     | (ver `.env`, no se lista aquí)         |

Usuario de prueba único en dev: `fulano@panda.test` / `12345678`.

## Headers

| Header              | Cuándo                                       | Valor                          |
|---------------------|----------------------------------------------|--------------------------------|
| `X-API-Key`         | TODO request a `API_BASE_URL`                | `environment.apiKey`           |
| `Authorization`     | Solo si hay sesión activa (`Session` válida) | `Bearer <bearerToken>`         |
| `Content-Type`      | Requests con body                            | `application/json`             |
| `Accept`            | Todos                                        | `application/json`             |

Inyección centralizada en `src/L3_periphery/interceptors/auth-headers.interceptor.ts`. **Ningún otro código** del proyecto debe armar estos headers manualmente.

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

## Mapeo HTTP → errores de dominio (L3 → L1)

| Origen                              | Error L1 emitido            | Mensaje UI                                          |
|-------------------------------------|-----------------------------|-----------------------------------------------------|
| `POST /auth/login` → `401`          | `InvalidCredentialsError`   | "Credenciales inválidas"                            |
| `POST /auth/login` → `5xx` o network | `NetworkError`              | "No se pudo conectar al servidor. Inténtalo de nuevo." |
| Cualquier endpoint protegido → `401` | (logout silencioso)         | "Sesión expirada, inicia sesión nuevamente."        |
| `POST /auth/logout` → cualquier error | (best-effort, sin error)    | n/a (logout local procede igual)                    |

**Regla crítica:** clasificar SIEMPRE por `(status code, endpoint)`, NUNCA por el campo `message` del body. Backend usa al menos 3 strings distintos para 401 y pueden cambiar sin aviso.

## CORS

API-FAKE responde con `Access-Control-Allow-Origin: *`. El dev server Angular (`http://localhost:4200`) está cubierto sin configuración extra.

## Comportamientos confirmados en dev

- Token Sanctum es **revocado server-side** en logout (verificado: `/auth/me` con token post-logout devuelve 401 `"Unauthenticated."`).
- Sin política de expiración configurada (asumimos token longevo hasta logout explícito).
- Sin rate limit en dev.

## Fuera de contrato (Fase 2 o ajeno)

- Refresh tokens
- Registro, recuperación de contraseña, MFA
- Endpoints de cartilla de marcaciones (se solicitarán en su propio cambio)
