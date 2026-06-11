## Context

Fase 1 dejó la PWA con login funcional + redirect a `/home` vacío. **Fase 2 llena `/home` con la cartilla de marcaciones**: lista de simulacros del día, entrada a cada uno cuando está abierto, marcaciones A–E, envío al backend, todo tolerante a pérdida de red. El enunciado vive en papel; la PWA solo registra las marcaciones del alumno.

Restricciones que no se mueven:
- Arquitectura hexagonal estricta L1/L2/L3/LR (ESLint enforza imports, `hexagonal-guard` audita lo demás).
- L1 + L2 son TypeScript puro (cero `@angular/*`, cero `rxjs`, cero browser APIs).
- Bearer + X-API-Key vía interceptor único; ningún otro código arma esos headers.
- Strings UI en es-PE hardcoded.
- Clasificación de errores HTTP por `(status, endpoint)`, NUNCA por texto del body.

Stakeholders:
- Alumno (usuario final, supervisado en aula con el enunciado en papel).
- Profesor (asigna simulacros la noche anterior, revisa estado al día siguiente — fuera del scope de esta PWA).
- Equipo de API-FAKE (entrega los dos endpoints nuevos siguiendo este contrato).

## Goals / Non-Goals

**Goals:**
- Que el alumno vea sus simulacros del día con estado claro (`pendiente | abierto | enviado | cerrado`).
- Que marque sus respuestas durante la ventana del simulacro, incluso si la red parpadea.
- Que el envío al backend respete el "tiempo de término" del cliente (`clientSubmittedAt`) cuando cae dentro de ventana, separándolo del "tiempo de envío" (`serverReceivedAt`, auditoría).
- Que el auto-envío a T=0 sea silencioso y no genere spike masivo en backend.
- Que la sesión sobreviva el día académico sin re-login forzado, vía bearer rolling 6h.
- Que la arquitectura siga estricta L1/L2/L3/LR, lista para evolucionar (resultados, historial, etc.).

**Non-Goals:**
- Mostrar enunciados en la app (siguen en papel).
- Calificaciones, resultados o feedback post-envío (Fase 2.x o posterior).
- Notificaciones push o recordatorios ("tu examen empieza en 10 min").
- Historial de simulacros pasados (Fase 2.x).
- Soporte multi-dispositivo coherente (Bearer puede compartirse, idempotencia 409 protege estado final, pero la UX puede divergir entre dispositivos del mismo alumno).
- Defensa anti-fraude técnica (DevTools, manipulación de IndexedDB). Threat model asume aula supervisada.
- I18n (en es-PE hardcoded, igual que Fase 1).

## Decisions

### Decision 1: Modelo de 4 estados derivados por backend en cada GET

**Decisión:** `pendiente | abierto | enviado | cerrado`. El backend computa el estado en cada `GET /v3/simulacros` a partir de `(inicio, fin, envío_recibido, serverTime)`. NO se persiste como columna.

**Por qué:**
- El estado siempre es función pura de esos cuatro inputs → eliminar la columna persistida elimina inconsistencias.
- 4 estados (vs 5 con `atrasable`) refleja la regla de negocio real: **pasado `fin` sin envío, el simulacro está cerrado, no hay segunda oportunidad**.
- Cliente NO deriva el estado por sí mismo del reloj local; siempre lo recibe del backend (autoridad de bloqueo).

**Alternativa descartada:** mantener `atrasable` como ventana de gracia post-`fin` donde el alumno todavía podía enviar. Decisión del producto: simplicidad operativa pesa más que la indulgencia con el alumno que llegó tarde.

### Decision 2: Dos tiempos separados — `clientSubmittedAt` (confianza al cliente) + `serverReceivedAt` (auditoría)

**Decisión:** el POST de envío incluye `clientSubmittedAt` (timestamp anclado al `serverTime + offset` cuando el alumno apretó Enviar o llegó T=0). El backend acepta ese timestamp como verdad del "tiempo de término" del examen, siempre que cumpla `inicio ≤ clientSubmittedAt ≤ fin`. El backend registra adicionalmente `serverReceivedAt` con su clock real, solo para auditoría.

**Por qué:**
- Resuelve el caso "alumno apretó Enviar a las 8:55 pero la red volvió a las 9:30" sin penalizar al alumno por una caída de red legítima.
- Separa dos preocupaciones que antes estaban mezcladas: cuándo terminó el examen (regla de negocio) vs cuándo llegó la red (operativo).
- Backend valida `[inicio, fin]` → bloquea fraude torpe (mandar timestamps obviamente fuera de ventana) sin costo extra.

**Alternativa descartada (A):** backend = único reloj, lo que llega tarde es tarde. Más simple, pero perjudica al alumno con red flaky → producto la descarta.

**Alternativa descartada (B):** ventana de gracia limitada (1h máximo entre `clientSubmittedAt` y `serverReceivedAt`). Más resistente a fraude pero introduce un parámetro arbitrario → producto prefiere "confianza total" con threat model documentado.

### Decision 3: Cliente NO confía en su reloj para bloqueo de entrada; SÍ lo usa para `clientSubmittedAt`

**Decisión:** la PWA usa `serverTime` del último GET + offset local para decidir si dejar entrar a un simulacro (autoridad de bloqueo). El mismo offset se aplica al `clientSubmittedAt` cuando el alumno aprieta Enviar (autoridad de "tiempo de término").

**Por qué:**
- Anclar todo al `serverTime` elimina el ataque "cambiar la hora del celular para entrar antes de tiempo".
- El offset se computa al recibir el GET: `offset = serverTime - Date.now()`. Se aplica sumándolo a `Date.now()` cada vez que se necesita "hora actual" en la app.
- Si el alumno cambia el reloj local entre GET y Enviar, el offset compensa.

**Alternativa descartada:** sincronizar con NTP del navegador o servidor de tiempo externo. Overkill para este caso de uso; el GET ya pasa por backend autenticado y trae `serverTime`.

### Decision 4: Auto-envío silencioso a T=0 con jitter ±3s

**Decisión:** la PWA programa un timer (`setTimeout`) ajustado al offset para disparar el POST automáticamente cuando `serverTime` llega a `fin`. El timer aplica un jitter aleatorio entre `[-3s, +3s]` para distribuir la carga.

**Por qué:**
- 20k alumnos terminando un simulacro a las 9:00:00 sin jitter = spike de 20k POSTs/s. Con jitter ±3s → ~3.3k POSTs/s sostenidos por 6s. Backend lo aguanta sin escalar.
- Jitter es invisible para el alumno (3s antes o después no cambia el resultado: `clientSubmittedAt = fin` en todos los casos).
- El POST se genera SIEMPRE con `clientSubmittedAt = fin` exacto. Si llega después por red caída, el backend lo acepta como `enviado` a las `fin`.

**Alternativa descartada:** sin jitter, dejar que el backend escale a demanda. Innecesariamente caro y deja el sistema frágil al "thundering herd" clásico.

### Decision 5: IndexedDB scopeada por `userEmail` + wipe en logout

**Decisión:** las claves en IndexedDB siguen el patrón `cartilla.<userEmail>.simulacro.<id>` para marcaciones y `cartilla.<userEmail>.queue` para envíos pendientes. En `LogoutUseCase` se ejecuta un wipe completo de todas las entradas con prefix `cartilla.<userEmail>.`.

**Por qué:**
- Si dos alumnos comparten un celular y uno olvida hacer logout, las marcaciones quedan visibles para el siguiente. Scope por userEmail mitiga.
- Wipe en logout es defensa adicional: si el alumno se desloguea, sus marcaciones en borrador desaparecen del dispositivo (los envíos confirmados ya están en backend).
- Los envíos en queue se procesan o se descartan en logout (decisión: descartar — el alumno está saliendo, no hay sesión para autenticar el POST diferido).

**Alternativa descartada:** un store global sin scope. Más simple pero leaks de datos entre usuarios.

### Decision 6: Bearer rolling 6h vía header `X-New-Bearer` en respuestas

**Decisión:** backend responde con header `X-New-Bearer: <token>` en cualquier respuesta autenticada cuando el TTL del bearer actual cae bajo un umbral (ej. 2h restantes). El interceptor de L3 lee el header en cada respuesta exitosa y, si presente, actualiza la sesión persistida vía `SessionStorage`.

**Por qué:**
- El día académico puede llegar a 8–10h. Bearer fijo de 6h fuerza re-login mid-day → mala UX en simulacros de tarde.
- Rolling vía header de respuesta es transparente para el cliente: no requiere endpoint extra de refresh ni tokens dobles (refresh + access).
- Si el alumno no abre la app durante 6h, el bearer expira y la próxima request devuelve 401 → logout silencioso + redirect a login. Caso aceptable (no estuvo activo).

**Alternativa descartada (A):** refresh token endpoint dedicado. Más estándar pero introduce un segundo token y un flujo extra. Overkill para una app de un día académico.

**Alternativa descartada (B):** bearer de larga vida (24h). Más simple pero amplía la ventana de exposición si el token se filtra.

### Decision 7: Polling 120s + visibilitychange + pull-to-refresh

**Decisión:** la lista de simulacros se refresca:
1. Al hacer focus en `/home` (`visibilitychange` event).
2. Cada 120s mientras `/home` esté visible y la pestaña activa.
3. Por pull-to-refresh manual.

**Por qué:**
- 120s × 20k alumnos = 167 req/s sostenido en GET /simulacros. Cacheable con ETag, manejable.
- 30s era agresivo en una propuesta anterior, sin beneficio real (los estados no cambian en intervalos tan cortos).
- Focus + pull-to-refresh cubre los momentos críticos (alumno vuelve a la app, alumno duda y refresca).
- Pausamos polling cuando la pestaña no está visible → cero costo en background.

**Alternativa descartada:** Server-Sent Events o WebSockets para push de estados. Más complejo, overkill para un sistema con transiciones tan lentas (minutos, no segundos).

### Decision 8: Indicador de conectividad como signal global

**Decisión:** un signal `isOnline` derivado de `navigator.onLine` y los eventos `online`/`offline`, expuesto desde un servicio L3 (`BrowserConnectivity`) detrás del puerto L1 `Connectivity`. La UI lo lee directamente para renderizar el badge.

**Por qué:**
- `navigator.onLine` es la API estándar más confiable disponible cross-browser sin polling.
- Puerto en L1 permite tests sin tocar `navigator` y permite cambiar a estrategia con ping si en el futuro se necesita.
- Verde/rojo, sin amarillo. Decisión de producto: estados intermedios confunden.

### Decision 9: Sin overlap de simulacros — backend garantiza, cliente asume

**Decisión:** la lista que retorna `GET /v3/simulacros` nunca contiene dos simulacros con estado `abierto` simultáneo. Backend valida al asignar.

**Por qué:**
- Simplifica el modelo del cliente: a lo más un simulacro activo a la vez.
- Elimina la pregunta "¿cómo decide el alumno cuál marcar primero?" — no aplica.
- Si el backend falla esta garantía (bug), el cliente se comporta razonablemente (deja entrar al primero, ignora el resto), pero el contrato dice que no debería pasar.

### Decision 10: 7 capabilities mapeadas a la arquitectura hexagonal

| Capability | L1 (dominio) | L2 (use cases) | L3 (adapters) | LR (UI) |
|---|---|---|---|---|
| `exam-list` | `Simulacro` entity, `EstadoSimulacro` VO, puerto `SimulacrosApi` | `ObtenerSimulacrosDelDia` | `HttpSimulacrosApi` | `HomePage` extendida |
| `exam-marking` | `Marcacion` entity, `Alternativa` VO | `MarcarRespuesta` | — | `SimulacroPage` + view-model con Signals |
| `exam-submission` | puerto `SimulacrosApi.enviar`, errors `SimulacroNoAsignado`, `SimulacroCerrado` | `EnviarSimulacro`, `ProgramarAutoEnvio` | `HttpSimulacrosApi` (mismo adapter) | botón Enviar + auto-envío silencioso en view-model |
| `offline-storage` | puerto `MarkingsStorage` | (consumido por todos los use cases anteriores) | `IndexedDbMarkingsStorage` | — |
| `connectivity-indicator` | puerto `Connectivity`, signal `isOnline` | — | `BrowserConnectivity` | badge en shell layout |
| `server-time-sync` | puerto `Clock`, `ServerTime` VO | `CalcularOffsetServidor` | `ServerAnchoredClock` | countdowns en view-models |
| `auth-session` (modified) | (sin cambios en L1) | `ActualizarBearerSiRenovado` | interceptor extendido para leer `X-New-Bearer` | — |

**Por qué:** mantener boundaries estrictas paga aquí dividendos — el segundo adapter (IndexedDB) del proyecto, el primer puerto de tiempo, todo testeable sin tocar Angular ni el browser. `hexagonal-guard` audita antes de archive.

## Risks / Trade-offs

- **Riesgo: manipulación de `clientSubmittedAt` vía DevTools** → Mitigación: backend valida `[inicio, fin]`; threat model documentado asume aula supervisada + enunciado en papel reduce el incentivo. Riesgo aceptado por producto.

- **Riesgo: bearer compartido entre dispositivos del mismo alumno con marcaciones divergentes** → Mitigación: idempotencia 409 en backend garantiza estado final único. UX puede confundir ("ya enviado" en device B cuando él no envió desde ahí) pero sin pérdida de integridad. Aceptado.

- **Riesgo: alumno avanzado modifica IndexedDB para "marcar" preguntas que su compañero respondió** → Mitigación: scope por `userEmail` + wipe en logout + las respuestas A–E no tienen valor sin el enunciado en papel. Aceptado.

- **Riesgo: spike a T=0 colapsa backend si jitter ±3s es insuficiente** → Mitigación: el jitter se parametriza vía constante, se puede ampliar a ±5s o ±10s sin cambios de contrato si los stress-tests del backend lo piden.

- **Riesgo: backend incumple no-overlap y devuelve dos simulacros `abierto`** → Mitigación: cliente acepta el primero, ignora el segundo, loguea warning. Bug de backend que produce queja del alumno pero no corrupción de datos.

- **Riesgo: `X-New-Bearer` no llega y el bearer expira mid-día** → Mitigación: 401 en cualquier endpoint protegido dispara logout silencioso + redirect a login (igual que Fase 1). El alumno re-loguea con sus credenciales. Caso doloroso pero recuperable.

- **Riesgo: IndexedDB no disponible (modo incógnito en algunos browsers)** → Mitigación: el adapter detecta y devuelve error de dominio `OfflineStorageUnavailable`. La UI muestra un banner "Tu navegador no soporta marcaciones offline" y deshabilita la entrada al simulacro. Edge case raro en mobile pero merece manejo.

- **Trade-off: 4 estados vs 5** → menor flexibilidad para el alumno que llega tarde (no hay "atrasable"). Aceptado: producto prefiere claridad.

- **Trade-off: client trust en `clientSubmittedAt` vs auditoría estricta** → menor defensa contra fraude técnico. Aceptado: aula supervisada + enunciado en papel + cost/benefit de no implementar anti-fraude complejo.

## Migration Plan

Esta es una feature nueva sin migración de datos previa. El plan se reduce a:

1. **Backend (out of band):** equipo de API-FAKE implementa `GET /v3/simulacros` y `POST /v3/simulacros/:id/envio` siguiendo este contrato. PWA puede desarrollarse en paralelo con un adapter HTTP que apunta a endpoints mock o reales según `environment`.
2. **PWA shell PWA mobile-lite desde día 1:** manifest + service worker básico (cacheo del shell, no de datos). Esto permite "Add to Home Screen" en mobile desde la primera capability mergeada.
3. **Orden de capabilities (sugerido en `tasks.md`):**
   - `server-time-sync` y `connectivity-indicator` primero (infraestructura sin UI).
   - `offline-storage` (puerto + adapter IndexedDB).
   - `exam-list` (consume server-time + storage).
   - `exam-marking` (consume storage).
   - `exam-submission` (consume todo lo anterior).
   - `auth-session` modified (interceptor extendido, último porque toca código existente).
4. **Rollback:** no aplica como tal — si una capability rompe `/home`, se revierte el commit correspondiente y la capability previa sigue funcionando. La arquitectura hexagonal hace que cada adapter sea reemplazable independientemente.

Per [[feedback-workflow-discipline]]: 1 commit quirúrgico por sección SDD (proposal, design, specs, tasks, cada capability implementada). Subagentes: `frontend-builder` para LR, `test-engineer` para tests, `hexagonal-guard` antes de archive.

## Open Questions

Ninguna crítica al momento. Las siguientes son refinamientos que pueden ajustarse durante implementación sin invalidar specs:

1. **Umbral exacto para que backend emita `X-New-Bearer`** — propuesta: 2h restantes del TTL de 6h. A confirmar con backend según su modelo de Sanctum tokens.
2. **Tamaño exacto del jitter** — propuesta: ±3s. Puede ampliarse vía constante si stress-tests del backend lo piden.
3. **Comportamiento de queue de envíos en logout** — propuesta: descartar. Alternativa: confirmar antes de cerrar sesión. A definir cuando se diseñe la UX del botón "Cerrar sesión".
4. **Estrategia exacta del service worker** — Fase 2 cubre shell mínimo (manifest + cache del app shell). Cacheo de datos / background sync queda para una iteración posterior si se necesita.
5. **Campo `enviadoEn` en `Simulacro` entity** — la spec UI menciona "Enviado a las HH:MM" pero la entidad actual no expone ese timestamp. Se introducirá en sec.9 cuando `EnviarSimulacroUseCase` reciba la respuesta del POST con `clientSubmittedAt`. Mientras tanto el HomePage muestra `fin` como placeholder con `DEUDA:` anotada inline.
