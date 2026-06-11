# Solicitud de contrato API-FAKE para `add-auth-login` (Fase 1)

**Para:** equipo backend de API-FAKE
**De:** equipo frontend NeonPanda
**Cambio relacionado:** `openspec/changes/add-auth-login`
**Estado:** ✅ CONFIRMADO por backend (2026-06-11) — endpoints abiertos y operativos en API-FAKE Docker

Este documento definió los endpoints, headers y formatos que la PWA NeonPanda necesita en API-FAKE (Docker local) para completar la Fase 1 (login funcional). El backend confirmó valores concretos; quedan registrados en la sección 0.

---

## 0. Valores confirmados por backend (2026-06-11)

- **Base URL (dev):** `http://localhost:2004/v3`
- **API_KEY (dev):** `apifake_cddebd7dc3dcc9aa1da296d5995e5214dc6c23931a573b4a`
- **Usuario de prueba único:** `fulano@panda.test` / `12345678`
- **Rutas abiertas en Laravel:**
  ```php
  Route::post('/auth/login', [AuthController::class, 'login']);              // público (solo X-API-Key)
  Route::middleware('auth:sanctum')->group(function () {
      Route::post('/auth/logout', [AuthController::class, 'logout']);        // X-API-Key + Bearer
      Route::get('/auth/me',     [AuthController::class, 'me']);             // X-API-Key + Bearer
  });
  ```
- **Shape de respuesta `POST /auth/login` confirmado:**
  ```json
  {
    "token": "5|NWRFefD1MdOGvSmW3wNwQ9QS3PPNetIOKB8b7SQe7c622f9f",
    "user": { "email": "fulano@panda.test", "name": "fulano Demo" }
  }
  ```
- **Decisiones §4 sin respuesta explícita (se mantienen como default, no bloqueantes):** #3 expiración del token Sanctum, #7 rate limit en `/auth/login`, #8 política multi-entorno de la api-key.

---

## 1. Convenciones generales

- **Base URL:** `http://localhost:2004/v3` en dev (la PWA la lee de `.env` como `API_BASE_URL`). El prefijo `/v3` versiona el contrato y es parte de la base URL para que los endpoints en el adapter L3 se escriban como `/auth/login` relativos a la base.
- **Codificación:** JSON UTF-8 en todas las respuestas y cuerpos.
- **Headers que la PWA envía siempre:**
  - `X-API-Key: <api-key>` — en TODOS los endpoints, validado por middleware.
  - `Authorization: Bearer <token>` — solo en endpoints protegidos.
  - `Content-Type: application/json` — en requests con body.
  - `Accept: application/json`.

## 2. Middleware requerido

### 2.1 Middleware de API key (global)

Aplicado a TODAS las rutas, incluyendo `/auth/login`.

- Falta `X-API-Key` → `401 Unauthorized` con body:
  ```json
  { "message": "API key requerida" }
  ```
- `X-API-Key` no coincide con el configurado → `403 Forbidden` con body:
  ```json
  { "message": "API key inválida" }
  ```

### 2.2 Middleware de autenticación (Sanctum bearer)

Aplicado a rutas protegidas (`/auth/logout`, `/auth/me`, y futuras de Fase 2).

- Falta `Authorization` → `401 Unauthorized` con body:
  ```json
  { "message": "No autenticado" }
  ```
- Bearer inválido o expirado → `401 Unauthorized` con body:
  ```json
  { "message": "Token inválido" }
  ```

### 2.3 CORS (necesario para el dev server)

- **Allowed Origins:** `http://localhost:4200` (dev server Angular).
- **Allowed Methods:** `GET, POST, OPTIONS`.
- **Allowed Headers:** `X-API-Key, Authorization, Content-Type, Accept`.
- **Allow Credentials:** no requerido (la PWA no envía cookies; el bearer va por header).

## 3. Endpoints

### 3.1 `POST /auth/login` — público (solo `X-API-Key`)

Autentica al usuario y devuelve el bearer.

**Request:**
```http
POST /auth/login HTTP/1.1
Host: <API_BASE_URL>
X-API-Key: <api-key>
Content-Type: application/json
Accept: application/json
```

```json
{
  "email": "usuario@example.com",
  "password": "secret123"
}
```

**Response 200 — éxito:**
```json
{
  "token": "1|abc123...sanctum-personal-access-token",
  "user": {
    "email": "usuario@example.com",
    "name": "Nombre Apellido"
  }
}
```

**Response 401 — credenciales inválidas:**
```json
{ "message": "Credenciales inválidas" }
```

**Response 422 — error de validación:**
```json
{
  "message": "Los datos proporcionados no son válidos",
  "errors": {
    "email":    ["El campo email es obligatorio."],
    "password": ["El campo password es obligatorio."]
  }
}
```

**Response 429 — rate limit (si aplica):**
```json
{ "message": "Demasiados intentos, intenta nuevamente más tarde." }
```

**Response 5xx:** la PWA mostrará "No se pudo conectar al servidor."

---

### 3.2 `POST /auth/logout` — protegido (`X-API-Key` + `Authorization`)

Invalida el token server-side.

**Request:**
```http
POST /auth/logout HTTP/1.1
Host: <API_BASE_URL>
X-API-Key: <api-key>
Authorization: Bearer <token>
Accept: application/json
```

Sin body.

**Response 204:** sin body. El token queda inutilizable.

**Response 401:** token ya inválido. La PWA igual limpia el storage local (logout es idempotente del lado cliente).

---

### 3.3 `GET /auth/me` — protegido (`X-API-Key` + `Authorization`) — recomendado

Permite a la PWA validar la sesión al arrancar (cuando hay un bearer persistido en `localStorage`).

**Request:**
```http
GET /auth/me HTTP/1.1
Host: <API_BASE_URL>
X-API-Key: <api-key>
Authorization: Bearer <token>
Accept: application/json
```

**Response 200:**
```json
{
  "user": {
    "email": "usuario@example.com",
    "name": "Nombre Apellido"
  }
}
```

**Response 401:** token inválido. La PWA limpia la sesión local y redirige a `/login`.

> Si abrir `GET /auth/me` no es viable ahora, lo omitimos: la PWA asume que el bearer persistido es válido hasta que cualquier request privado responda 401, momento en que hace logout silencioso. El costo es una pantalla flash si el token estaba muerto. No es bloqueante para Fase 1.

---

## 4. Decisiones a confirmar por backend

| # | Pregunta                                                            | Estado / Default                                       |
|---|---------------------------------------------------------------------|--------------------------------------------------------|
| 1 | ¿Identidad por `email` o por `username`?                            | ✅ `email` (confirmado, usuario `fulano@panda.test`)   |
| 2 | ¿OK el shape `{ token, user: { email, name } }` en login?           | ✅ Confirmado                                          |
| 3 | ¿Política de expiración del token Sanctum?                          | ⚠️ Sin respuesta — default: token longevo hasta logout |
| 4 | ¿Campos extra en `user`? (id, role, avatar...)                      | ✅ Solo `email` y `name` (confirmado por shape devuelto)|
| 5 | ¿OK `POST /auth/logout` invalidando el token server-side?           | ✅ Endpoint abierto bajo `auth:sanctum`                |
| 6 | ¿OK `GET /auth/me` para validar sesión al arrancar?                 | ✅ Endpoint abierto bajo `auth:sanctum`                |
| 7 | ¿Existe rate limit en `/auth/login`? ¿Bajo qué política?            | ⚠️ Sin respuesta — default: sin rate limit en dev      |
| 8 | ¿La api-key es la misma para todos los entornos o cambia por env?   | ⚠️ Sin respuesta — default: una por entorno vía `.env` |

## 5. Cómo verificaremos el contrato (acceptance)

Cuando los endpoints estén abiertos, validaremos manualmente con `curl` o Postman antes de integrar:

```bash
# 1. Falta X-API-Key
curl -i -X POST $API_BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"x@y.com","password":"x"}'
# esperado: 401, body { "message": "API key requerida" }

# 2. Credenciales válidas
curl -i -X POST $API_BASE_URL/auth/login \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@neonpanda.test","password":"secret"}'
# esperado: 200, body con { token, user }

# 3. Credenciales inválidas
curl -i -X POST $API_BASE_URL/auth/login \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@neonpanda.test","password":"wrong"}'
# esperado: 401, body { "message": "Credenciales inválidas" }

# 4. Logout con bearer válido
curl -i -X POST $API_BASE_URL/auth/logout \
  -H "X-API-Key: $API_KEY" \
  -H "Authorization: Bearer $TOKEN"
# esperado: 204

# 5. /auth/me con bearer válido
curl -i $API_BASE_URL/auth/me \
  -H "X-API-Key: $API_KEY" \
  -H "Authorization: Bearer $TOKEN"
# esperado: 200, body con { user }
```

## 7. Resultados de validación con `curl` (2026-06-11) — tarea 1.6 ✅

Validados los 5 casos de §5 más una verificación extra de revocación del token tras logout. API-FAKE responde en `http://localhost:2004/v3` con `Access-Control-Allow-Origin: *`.

| # | Caso                                                  | Respuesta observada                                                                              |
|---|-------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| 1 | `POST /auth/login` sin `X-API-Key`                    | `401` · `{"message":"API key invalida o ausente."}`                                              |
| 2 | `POST /auth/login` con credenciales válidas           | `200` · `{"token":"6\|lP2nsQrVOVE…","user":{"email":"fulano@panda.test","name":"fulano Demo"}}`  |
| 3 | `POST /auth/login` con password incorrecto            | `401` · `{"message":"Credenciales invalidas"}`                                                   |
| 4 | `POST /auth/logout` con bearer válido                 | `204 No Content` (sin body)                                                                      |
| 5 | `GET /auth/me` con bearer válido                      | `200` · `{"user":{"email":"fulano@panda.test","name":"fulano Demo"}}`                            |
| 6 | `GET /auth/me` con bearer ya invalidado (post-logout) | `401` · `{"message":"Unauthenticated."}` — confirma que logout revoca el token server-side       |

### Decisiones derivadas para el frontend

- **Clasificación de errores 401 SOLO por status code + endpoint context**, nunca por texto del `message`. El backend usa al menos 3 mensajes distintos para 401 (`API key invalida o ausente.` / `Credenciales invalidas` / `Unauthenticated.`) y puede cambiar; el mapeo a `InvalidCredentialsError` / sesión expirada / configuración rota debe basarse en (status, endpoint), no en el string.
- **CORS:** `Access-Control-Allow-Origin: *` — el dev server Angular en `:4200` está cubierto.
- **Mensaje genérico al usuario para 401 fuera de `/auth/login`:** "Sesión expirada, inicia sesión nuevamente." → logout silencioso + redirect a `/login`.

## 6. Fuera de scope (para conversaciones posteriores)

- Refresh tokens (asumimos Sanctum personal access tokens de larga duración).
- Registro de usuarios (`POST /auth/register`).
- Recuperación de contraseña (`POST /auth/forgot-password`).
- Endpoints de Fase 2 (cartilla de marcaciones) — se solicitarán en su propio cambio.
- MFA / 2FA.

---

**Acción esperada del equipo backend:** revisar este documento, responder las preguntas de la sección 4, y confirmar cuándo los endpoints estarán operativos en la instancia de API-FAKE en Docker. Una vez confirmado, este documento se promueve a `agents/api-contract.md` como fuente de verdad del proyecto.
