## ADDED Requirements

### Requirement: Renovación automática del bearer vía header `X-New-Bearer`

El sistema SHALL renovar automáticamente el bearer de la sesión activa cuando el backend incluya el header `X-New-Bearer` en cualquier respuesta autenticada. El interceptor de L3 (`auth-headers.interceptor.ts`) extiende su responsabilidad: además de inyectar el bearer en requests, lee el header de la respuesta y, si presente, despacha `ActualizarBearerSiRenovadoUseCase` (L2) que persiste el nuevo bearer vía `SessionStorage`. La sesión activa se actualiza sin que el alumno perciba el cambio.

#### Scenario: Backend envía nuevo bearer en respuesta a GET /simulacros

- **WHEN** el alumno tiene una sesión activa con bearer A
- **AND** invoca `GET /v3/simulacros` con bearer A
- **AND** el backend responde 200 con header `X-New-Bearer: B`
- **THEN** el interceptor invoca `ActualizarBearerSiRenovadoUseCase.execute("B")`
- **AND** la sesión persistida actualiza su `bearerToken` a B
- **AND** los próximos requests usan bearer B

#### Scenario: Respuesta sin header de renovación no toca la sesión

- **WHEN** el backend responde sin header `X-New-Bearer`
- **THEN** la sesión persistida queda intacta
- **AND** no se invoca `ActualizarBearerSiRenovadoUseCase`

#### Scenario: Renovación en cualquier endpoint autenticado, no solo GET /simulacros

- **WHEN** el backend incluye `X-New-Bearer` en la respuesta a `POST /v3/simulacros/:id/envio` o `GET /auth/me`
- **THEN** la sesión se actualiza igualmente
- **AND** la lógica de renovación no depende del endpoint específico

#### Scenario: Renovación silenciosa — sin re-render de la UI

- **WHEN** la renovación ocurre durante un GET de fondo (polling 120s)
- **THEN** la UI no muestra ningún indicador visual
- **AND** el alumno no es interrumpido

#### Scenario: Bearer renovado vacío rechazado

- **WHEN** el backend responde con `X-New-Bearer:` (string vacío)
- **THEN** el use case ignora el header
- **AND** la sesión persistida queda intacta

#### Scenario: Bearer expirado sin renovación previa

- **WHEN** el alumno no ha hecho ningún request en más de 6h y el bearer expira
- **AND** el próximo request devuelve 401
- **THEN** procede la lógica de logout silencioso definida en Fase 1
- **AND** el alumno es redirigido a `/login`
