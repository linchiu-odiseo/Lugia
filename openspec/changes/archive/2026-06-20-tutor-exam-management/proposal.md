# tutor-exam-management — Proposal

- **Status:** proposed
- **Depends on:** `fase-3-exam-list-learnex` (archived 2026-06-16), `fase-3-exam-submit-learnex` (archived 2026-06-17). Reusa `ExamServerStatus`, `credentials.interceptor`, `authGuard`/`roleGuard`, `TutorProfile`.
- **Unlocks:** Operación real del examen virtual desde la PWA por parte del tutor (iniciar/finalizar/habilitar alumnos), que es lo que hoy dispara el `scheduled → in_progress` que el alumno ya detecta por polling. Sin esto, el flujo del alumno no tiene quién lo arranque desde el dispositivo.

## Why

Hoy el tutor en la PWA SOLO tiene `/tutor/home` con su perfil (`GET /tutor/me`) y un placeholder "Próximamente". No hay forma de ver ni operar exámenes desde Lugia. El alumno detecta que un examen se abrió porque **alguien** del lado server cambió el `status` de `scheduled` a `in_progress` — pero ese "alguien" no existe todavía en la PWA del tutor.

learnex (branch `feat/virtual-exam-ui` / PR #276, aún NO en `develop`) ya expone 6 endpoints REALES, tenant-scopeados, con permisos `examenes:read` y `examenes:write_virtual` que el JWT del tutor ya trae. Este change agrega el **lado tutor** espejando el flujo del alumno (`GET lista → tarjetas → pantalla de detalle`), pero con acciones de gestión en vez de marcación.

A diferencia del alumno (que acumula respuestas offline en una outbox durable), las acciones del tutor son **online-only**: iniciar, finalizar y habilitar alumnos son operaciones de servidor que no tiene sentido encolar. Si no hay red, se muestra estado de error + reintentar. Cero outbox, cero IndexedDB para este change.

## Contrato del backend (verificado contra PR #276)

Todos los endpoints: prefijo `/t/:slug`, JWT por cookie HttpOnly (lo maneja `credentials.interceptor`), **responses camelCase**, error body `{ code, message, details?, traceId? }`.

| # | Método | Path | Permiso | Body | Éxito | Respuesta |
|---|---|---|---|---|---|---|
| 1 | GET | `/tutor/virtual-exams` | `examenes:read` | — | 200 | `{ items: TutorVirtualExamListItem[] }` |
| 2 | GET | `/virtual-exams/:recordId` | `examenes:read` | — | 200 | `VirtualExamResponse` (incluye `enabledStudentIds`) |
| 3 | GET | `/classrooms/:classroomId/students?virtualExamDetailId=` | `examenes:read` | — | 200 | `{ students: ClassroomStudentForExam[] }` |
| 4 | PATCH | `/virtual-exams/:recordId/enabled-students` | `examenes:write_virtual` | `{ enabledStudentIds: string[] }` | 200 | body vacío |
| 5 | POST | `/virtual-exams/:recordId/start` | `examenes:write_virtual` | — | 204 | sin body |
| 6 | POST | `/virtual-exams/:recordId/finalize` | `examenes:write_virtual` | — | 200 | `{ transitioned: boolean; jobId?: string }` |

**Item de la lista (1):** `id` (detailId = `virtual_exam_detail.id`), `recordId` (= `exam_traceability_record.id`, el id usado por TODOS los demás endpoints), `classroomId`, `entryId`, `status` (`scheduled | in_progress | finalized` — nunca `archived`, filtrado server-side), `name`, `courseId: string | null`, `count: number | null` (null hasta iniciar), `duration` (segundos), `startedAt: string | null`, `finishedAt: string | null`, `createdAt`.

**Detalle (2):** `id`, `recordId`, `status` (puede incluir `archived`), `name`, `courseId | null`, `count | null`, `duration`, `enabledStudentIds: string[]`, `startedAt | null`, `finishedAt | null`, `createdAt`. **NO trae `classroomId` ni `entryId`** — solo la lista los tiene.

**Alumno del aula (3):** `studentId`, `studentCode`, `firstName`, `lastName`, `enabled: boolean`, `hasSubmitted: boolean`. El query `virtualExamDetailId` toma el `id` (detailId), no el recordId; vacío == omitido (todos `enabled=true`).

### Gotchas confirmados (cambian supuestos previos)

- **`finalize` devuelve 200 con `{ transitioned, jobId? }`**, NO 202/204. Hay que leer `transitioned` para distinguir "recién finalizado" de "ya estaba finalizado" (idempotente). El comentario del controller dice 202 pero NO está implementado.
- **`start` devuelve 204** sin body; **`enabled-students` devuelve 200** sin body.
- **`count` es null hasta iniciar**; **`courseId` puede ser null**. La UI renderiza "—".
- **Los errores NO traen codes semánticos finos** (como el alumno con `STUDENT_NOT_LINKED`). Traen `code` genérico (`forbidden`, `not_found`, `conflict`, `unprocessable_entity`, `bad_request`, `VALIDATION_ERROR`, `TENANT_AUTH_FORBIDDEN_PERMISSION`) + un `message` en prosa (a veces inglés con UUIDs): `'Tutor is not assigned to this classroom'`, `'Configurá las claves del examen antes de iniciarlo'`, `'Cannot start a virtual exam with 0 enabled students'`, `'The enabled student set is frozen once the exam is finalized'`, `'Student <uuid> has already submitted and cannot be removed...'`, `'Cannot finalize a scheduled exam — start it first'`.

## Decisiones de diseño

**D1 — classroomId del detalle.** `GET /virtual-exams/:recordId` (detalle) NO devuelve `classroomId`, pero el endpoint de alumnos (3) lo necesita en el path. Solución (elegida): ruta `/tutor/exams/:recordId` (URL limpia, simétrica a `/student/simulacro/:id`); la lista del tutor se cachea en memoria en un store compartido y la pantalla de gestión lee `classroomId` + `detailId` de ahí. En deep-link/refresh (lista vacía), la VM de detalle **refetchea la lista** (1 GET barato) para resolver `classroomId`. Deep-link safe, sin cambio de backend.

**D2 — clasificación de errores por STATUS, copy por acción.** El back no da codes finos; el único discriminador de sub-casos (dos 409, dos 422) es el `message` en prosa, frágil de matchear. En vez de parsear prosa: el adapter L3 clasifica por **status** a errores de dominio (`VirtualExamNotFoundError` 404, `ExamConflictError` 409, `ExamPreconditionError` 422, `TutorExamForbiddenError` 403, `NetworkError` 0/429/5xx, `InvalidPayloadError` 400). La **VM** elige el copy en español según QUÉ use-case falló (iniciar/finalizar/habilitar) + el tipo de error — la VM ya conoce el contexto de la acción, no necesita el message. Robusto a cambios de copy del back.

**D3 — online-only, sin outbox.** Acciones del tutor no se encolan. `NetworkError` → estado de error visible + botón reintentar. Cero IndexedDB en este change.

**D4 — ruteo.** `/tutor/home` pasa a SER la lista (espejo de `/student/home`, que también es la lista, no `/student/exams`), reemplazando el placeholder. `/tutor/exams/:recordId` es la gestión. Se colapsa la idea de una ruta `/tutor/exams` separada para evitar doble redirect del `roleGuard('tutor')` (que ya manda a `/tutor/home`).

**D5 — defensa en profundidad para el 422 "0 alumnos".** El botón "Iniciar" se deshabilita en la UI si no hay alumnos habilitados, además de manejar el 422 del back. Los checkboxes de alumnos con `hasSubmitted === true` quedan deshabilitados (no se pueden desmarcar — el back tira 409). Si el examen está `finalized`, la pantalla de gestión es read-only.

## What changes

**L1 dominio**
- Nuevo port `TutorExamsApi` (`src/L1_domain/ports/tutor-exams-api.ts`): `getTutorExams(): Promise<readonly TutorExam[]>`, `getExamDetail(recordId: string): Promise<TutorExamDetail>`, `listClassroomStudents(req: { classroomId: string; virtualExamDetailId: string }): Promise<readonly ClassroomStudent[]>`, `updateEnabledStudents(req: { recordId: string; enabledStudentIds: readonly string[] }): Promise<void>`, `iniciar(recordId: string): Promise<void>`, `finalizar(recordId: string): Promise<FinalizeResult>`. El port del alumno (`ExamsApi`) NO se extiende.
- Read-model `TutorExam` (`src/L1_domain/entities/tutor-exam.ts`): `detailId`, `recordId`, `classroomId`, `entryId`, `serverStatus: ExamServerStatus`, `name`, `courseId: string | null`, `count: number | null`, `duration`, `startedAt: Date | null`, `finishedAt: Date | null`, `createdAt: Date`. Helpers: `puedeIniciar()` (status `scheduled`), `puedeFinalizar()` (status `in_progress`), `estaFinalizado()` (status `finalized`).
- Read-model `TutorExamDetail` (`src/L1_domain/value-objects/tutor-exam-detail.ts`): como el item pero con `enabledStudentIds: readonly string[]` y sin `classroomId`/`entryId`.
- VO `ClassroomStudent` (`src/L1_domain/value-objects/classroom-student.ts`): `studentId`, `studentCode`, `firstName`, `lastName`, `enabled: boolean`, `hasSubmitted: boolean`.
- Tipo `FinalizeResult`: `{ transitioned: boolean; jobId?: string }`.
- **Reusar** `ExamServerStatus` (mismos 3 estados visibles).
- Nuevos errores de dominio: `VirtualExamNotFoundError` (404), `ExamConflictError` (409), `ExamPreconditionError` (422), `TutorExamForbiddenError` (403). **Reusar** `NetworkError`, `InvalidPayloadError`.

**L2 use cases** (clases puras, sin decorador, constructor injection, `execute()` — online-only, errores propagados tal cual):
- `GetTutorExamsUseCase` → `readonly TutorExam[]`.
- `GetTutorExamDetailUseCase` → `execute({ recordId })`.
- `ListClassroomStudentsUseCase` → `execute({ classroomId, virtualExamDetailId })`.
- `IniciarExamenUseCase` → `execute({ recordId })`.
- `FinalizarExamenUseCase` → `execute({ recordId }): Promise<FinalizeResult>`.
- `ActualizarAlumnosHabilitadosUseCase` → `execute({ recordId, enabledStudentIds })`.

**L3 periferia**
- `api-paths.ts` (única fuente de verdad): `tutorVirtualExams()`, `virtualExam(recordId)`, `classroomStudents(classroomId, virtualExamDetailId)`, `virtualExamEnabledStudents(recordId)`, `virtualExamStart(recordId)`, `virtualExamFinalize(recordId)`. Todos con `encodeURIComponent`.
- `HttpTutorExamsApi implements TutorExamsApi` (`src/L3_periphery/http/http-tutor-exams-api.ts`): inyecta `HttpClient`, `firstValueFrom` con `timeout(10_000)`, NO setea `withCredentials` (lo hace el interceptor). Clasificador `classifyTutorError(err): Error` por status (D2). Mapea DTOs camelCase → read-models de dominio (incluido `string → Date` para timestamps, igual que el alumno).
- Token `TUTOR_EXAMS_API` + `{ provide: TUTOR_EXAMS_API, useExisting: HttpTutorExamsApi }` en `app.config.ts`; un factory provider por use-case (deps: `[TUTOR_EXAMS_API]`).
- Store compartido de la lista (D1): la VM de lista publica la última lista; la VM de detalle la consume para resolver `classroomId`/`detailId` sin llamada extra (con fallback a refetch).

**LR render**
- `/tutor/home` → nueva `TutorExamsListPage` + `TutorExamsListViewModel` (reemplaza el placeholder). Header de perfil reusado (`GetProfileUseCase('tutor')`), lista con polling 120s (`POLL_INTERVAL_MS`), tarjetas con 3 estados via Signals (`scheduled`/`in_progress`/`finalized`), tap navega a `/tutor/exams/:recordId`.
- `/tutor/exams/:recordId` → nueva `TutorExamDetailPage` + `TutorExamDetailViewModel`. Muestra detalle, botón **Iniciar** (si `scheduled`, deshabilitado si 0 habilitados), botón **Finalizar** (si `in_progress`, con confirmación), checkboxes de alumnos habilitados (PATCH al guardar; `hasSubmitted` deshabilitado; read-only si `finalized`). Estado de error de red + reintentar (D3). Copy de error por acción (D2).
- Ambas rutas con `canActivate: [authGuard, roleGuard('tutor')]`, lazy `loadComponent`. Page provee la VM local (`providers: [VM]`).

**Sin cambio:** todo el dominio/flujo del alumno, `credentials.interceptor`, `EnvioRetryDispatcher`, `MarkingsStorage`, storage IDB, `app.routes` del student. El change es estrictamente aditivo.

## Impact

Capabilities OpenSpec:
- **Nueva** `tutor-exams-api`: port L1 + adapter L3 + use cases L2 + read-models + clasificación de errores por status. (PR1 — fundación sin UI.)
- **Nueva** `tutor-exam-list`: VM de lista + page + ruta `/tutor/home` + tarjetas 3 estados + polling 120s + store compartido. (PR2.)
- **Nueva** `tutor-exam-management`: VM de detalle + page + ruta `/tutor/exams/:recordId` + iniciar/finalizar/habilitar + copy de error por acción. (PR3.)
- **Modificada** `http-client` (MINOR): 6 helpers nuevos en `apiPath` + tabla de clasificación de errores del tutor por status.
- **Modificada** `route-protection` (MINOR, no-breaking): `/tutor/home` ahora carga la lista, nueva `/tutor/exams/:recordId`, ambas bajo `[authGuard, roleGuard('tutor')]`.

## Out of scope

- Crear examen virtual y subir PDF (se hace en web-tenant). El tutor acá GESTIONA registros ya creados.
- Archivar examen (`finalized → archived`). No hay endpoint consumido en este change.
- Force-close / cierre administrativo de submissions de alumnos.
- Cualquier outbox/cola offline para acciones del tutor (online-only por design, D3).
- Telemetría de acciones del tutor.
- Notificación push al alumno cuando el tutor inicia (el alumno ya detecta por polling 120s; sin cambios).
- Optimistic UI / locking multi-tutor sofisticado: si dos tutores operan el mismo examen, el back resuelve por estado (409) y la UI refetchea. No se implementa CRDT ni nada.

## Delivery plan

3 PRs encadenados (tu slicing), cada uno ≤400 líneas, STRICT TDD con Vitest:

1. **`feat: fundación tutor-exams (L1+L2+L3) con tests, sin UI`** — port, read-models, errores, 6 use-cases, `api-paths`, `HttpTutorExamsApi`, token+wiring, `FakeTutorExamsApi`. Compila aislado, runtime inerte (nadie lo invoca aún).
2. **`feat: pantalla lista tutor (/tutor/home)`** — `TutorExamsListViewModel` + page + ruta + tarjetas + polling + store compartido. Reemplaza placeholder.
3. **`feat: pantalla gestión tutor (/tutor/exams/:recordId)`** — `TutorExamDetailViewModel` + page + iniciar/finalizar/habilitar + copy de error por acción + estados read-only/deshabilitado.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deep-link a `/tutor/exams/:recordId` sin lista en memoria → falta `classroomId` | Med | D1: VM de detalle refetchea la lista (1 GET barato) y resuelve `classroomId` por `recordId`. Test obligatorio del caso "lista vacía → refetch". |
| Copy de error frágil si se matchea prosa del back | Med | D2: clasificar por status, copy por acción en la VM. Cero parsing de `message`. |
| `finalize` mal interpretado como 202/204 | Low | Documentado: 200 + `{ transitioned, jobId? }`. Test del adapter asienta el shape. |
| `count`/`courseId` null rompen render | Low | Read-model los tipa `number | null` / `string | null`; UI renderiza "—". Test de mapeo con null. |
| Iniciar con 0 alumnos (422) | Low | D5: botón deshabilitado en UI + manejo del 422 como fallback. |
| Quitar alumno que ya entregó (409) | Low | D5: checkbox de `hasSubmitted` deshabilitado + manejo del 409. |
| Polling del tutor suma carga | Low | Mismo patrón que el alumno (120s, pausa en tab oculta). Sin cambios de infra. |
| `roleGuard` doble redirect si `/tutor/home` no es destino válido | Low | D4: `/tutor/home` ES la lista (destino directo del guard). |

## Rollback plan

1. El change es estrictamente aditivo: no toca el dominio/flujo del alumno, interceptor, storage ni rutas del student. `git revert` del/los merge commits elimina todo sin migración (no hay IDB nueva, no hay env flag nuevo).
2. Si solo molesta la UI: revertir PR2/PR3 deja la fundación (PR1) inerte sin impacto runtime (nadie inyecta los use-cases).

## Dependencies

- learnex corriendo la branch `feat/virtual-exam-ui` / PR #276 para integración local (los 6 endpoints NO están en `develop` todavía). Coordinación humana.
- El JWT del tutor debe traer `examenes:read` + `examenes:write_virtual` (confirmado en el sistema de permisos del rol `tutor`).

## Success criteria

- [ ] Tutor loguea → `/tutor/home` lista sus exámenes virtuales (solo de aulas donde es tutor), ordenados como vienen del back.
- [ ] Tarjeta muestra estado (`scheduled`/`in_progress`/`finalized`), `count` "—" si null, `duration` legible.
- [ ] Tap en tarjeta → `/tutor/exams/:recordId`; deep-link/refresh funciona (refetch de lista resuelve `classroomId`).
- [ ] Examen `scheduled` con ≥1 alumno habilitado → "Iniciar" → 204 → la tarjeta pasa a `in_progress` (el alumno lo ve en su próximo poll).
- [ ] Examen `in_progress` → "Finalizar" → 200 `{ transitioned: true }` → pasa a `finalized`. Segundo "Finalizar" → `{ transitioned: false }` sin error.
- [ ] Habilitar/deshabilitar alumnos → PATCH → 200 → set actualizado. `hasSubmitted` no desmarcable. `finalized` read-only.
- [ ] Iniciar con 0 habilitados: botón deshabilitado; si igual llega un 422 → mensaje claro en español.
- [ ] Sin red en cualquier acción → estado de error visible + reintentar; NO se encola nada.
- [ ] `npm run lint` limpio; `npm test` verde (tests nuevos pasan, existentes intactos).
- [ ] Cero literales `"vonex"` en `src/` (regla CLAUDE.md).

## Capabilities

> Esta sección es el CONTRATO entre `proposal.md` y `sdd-spec`. El `sdd-spec` agent lee esto para saber qué specs crear o actualizar.

### New Capabilities

- `tutor-exams-api`: port L1 `TutorExamsApi`, adapter L3 `HttpTutorExamsApi` con clasificación de errores por status, 6 use-cases L2 puros, read-models (`TutorExam`, `TutorExamDetail`, `ClassroomStudent`, `FinalizeResult`), errores de dominio nuevos. Contrato HTTP de los 6 endpoints. Online-only.
- `tutor-exam-list`: `TutorExamsListViewModel` con polling 120s, store compartido de la lista, tarjetas 3 estados con Signals, ruta `/tutor/home`, header de perfil reusado.
- `tutor-exam-management`: `TutorExamDetailViewModel`, ruta `/tutor/exams/:recordId`, iniciar/finalizar/habilitar alumnos, resolución de `classroomId` desde el store compartido con fallback a refetch, copy de error por acción, estados read-only/deshabilitado (D5).

### Modified Capabilities

- `http-client`: agrega 6 helpers a `apiPath` y la tabla de clasificación de errores del tutor por status (D2).
- `route-protection`: `/tutor/home` carga la lista del tutor; nueva `/tutor/exams/:recordId`; ambas bajo `[authGuard, roleGuard('tutor')]`.
