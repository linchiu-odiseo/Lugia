# Delta for tutor-exam-list

> Esta capability es **NUEVA**. Todos los requirements debajo son ADDED.
> Al archivar este change, este delta se promueve a `openspec/specs/tutor-exam-list/spec.md`.

## ADDED Requirements

### Requirement: TutorExamsListViewModel — carga y polling

`TutorExamsListViewModel` (`src/LR_render/tutor/tutor-exams-list/tutor-exams-list.view-model.ts`) SHALL:
- Inyectar `GetTutorExamsUseCase` y `GetProfileUseCase('tutor')`.
- Exponer la Signal `exams: Signal<readonly TutorExam[]>` (inicializa `[]`).
- Exponer la Signal `loading: Signal<boolean>` (inicializa `true` hasta el primer load).
- Exponer la Signal `error: Signal<boolean>` (inicializa `false`).
- Cargar la lista en `ngOnInit` (o en el constructor via `afterNextRender`/`effect`) invocando `GetTutorExamsUseCase.execute()`.
- Publicar la lista cargada en el store compartido (ver Requirement: Store compartido de la lista).
- Sondear la lista cada 120 000 ms (`POLL_INTERVAL_MS = 120_000`) — mismo patrón que `StudentExamsListViewModel`.
- Pausar el polling cuando el tab está oculto (`document.visibilityState === 'hidden'`), reanudarlo al volver a `'visible'`.
- En caso de error de red, setear `error = true` sin interrumpir el polling (el próximo tick intenta de nuevo).

#### Scenario: Lista cargada correctamente al iniciar

- **GIVEN** `GetTutorExamsUseCase.execute()` resuelve con `[exam1, exam2]`
- **WHEN** `TutorExamsListViewModel` se inicializa
- **THEN** `exams()` contiene `[exam1, exam2]`
- **AND** `loading()` es `false`
- **AND** `error()` es `false`

#### Scenario: Error de red — error Signal activa, polling continúa

- **GIVEN** `GetTutorExamsUseCase.execute()` rechaza con `NetworkError`
- **WHEN** el VM intenta cargar la lista
- **THEN** `error()` es `true`
- **AND** `exams()` permanece como estaba antes del error (no se limpia)
- **AND** el próximo tick de polling a los 120 s intenta de nuevo

#### Scenario: Polling se pausa al ocultar el tab

- **GIVEN** el VM tiene polling activo
- **WHEN** `document.visibilityState` cambia a `'hidden'`
- **THEN** el VM NO emite requests HTTP mientras el tab esté oculto

#### Scenario: Polling se reanuda al volver al tab

- **GIVEN** el polling estaba pausado por tab oculto
- **WHEN** `document.visibilityState` cambia a `'visible'`
- **THEN** el VM dispara inmediatamente una carga y reanuda el intervalo 120 s

#### Scenario: Polling cada 120 s emite nuevo request

- **GIVEN** el VM inicializado con datos
- **WHEN** transcurren 120 000 ms
- **THEN** se dispara un nuevo `GetTutorExamsUseCase.execute()`
- **AND** la lista se actualiza con el resultado

---

### Requirement: Store compartido de la lista (TutorExamsStore)

SHALL existir un store compartido de la lista (`src/LR_render/tutor/tutor-exams.store.ts` o similar) que:
- Expose una Signal `list: Signal<readonly TutorExam[]>` (inicializa `[]`).
- Permita a `TutorExamsListViewModel` publicar la lista cargada vía `setList(exams)`.
- Permita a `TutorExamDetailViewModel` leer `classroomId` y `detailId` de un `TutorExam` por `recordId`.
- Sea providedIn root (singleton de sesión, sin IndexedDB, sin persistencia) — cero outbox.

#### Scenario: Store permite resolver classroomId por recordId

- **GIVEN** el store contiene `[{ recordId: "rec-1", classroomId: "cls-1", detailId: "det-1", ... }]`
- **WHEN** `TutorExamDetailViewModel` consulta por `recordId = "rec-1"`
- **THEN** obtiene `classroomId = "cls-1"` y `detailId = "det-1"` sin hacer un request HTTP extra

#### Scenario: Store vacío — classroomId no resuelve desde store

- **GIVEN** el store está vacío (deep-link, primer acceso)
- **WHEN** `TutorExamDetailViewModel` consulta por cualquier `recordId`
- **THEN** la búsqueda retorna `undefined` y el VM activa el fallback (refetch)

#### Scenario: Store actualizado tras polling

- **GIVEN** el polling dispara una nueva carga
- **WHEN** `GetTutorExamsUseCase.execute()` resuelve con una lista actualizada
- **THEN** el store refleja la nueva lista inmediatamente

---

### Requirement: Tarjetas con 3 estados via Signals

`TutorExamsListPage` SHALL renderizar una tarjeta por cada `TutorExam` en `exams()`. Cada tarjeta SHALL reflejar el estado del examen según `serverStatus.value`:
- `'scheduled'` → visual "Programado" (color/badge del sistema de diseño).
- `'in_progress'` → visual "En curso" (color/badge distinto).
- `'finalized'` → visual "Finalizado" (color/badge distinto).
- `count === null` → renderizar `"—"` en lugar del número.
- `courseId === null` → omitir el campo o renderizar `"—"` según diseño.

#### Scenario: Lista renderizada en el orden devuelto por el backend

- **GIVEN** `GetTutorExamsUseCase.execute()` resuelve con `[examA, examB, examC]` (en ese orden)
- **WHEN** `TutorExamsListPage` renderiza
- **THEN** las tarjetas aparecen en el orden `[examA, examB, examC]` sin reordenamiento por la UI

#### Scenario: count null renderiza "—"

- **GIVEN** un `TutorExam` con `count === null`
- **WHEN** la tarjeta se renderiza
- **THEN** el campo de número de preguntas muestra `"—"` (no `null`, no `undefined`, no `0`)

#### Scenario: Tarjeta scheduled

- **GIVEN** un `TutorExam` con `serverStatus.value === 'scheduled'`
- **WHEN** la tarjeta se renderiza
- **THEN** el badge/estado muestra "Programado" o equivalente visual

#### Scenario: Tarjeta in_progress

- **GIVEN** un `TutorExam` con `serverStatus.value === 'in_progress'`
- **WHEN** la tarjeta se renderiza
- **THEN** el badge/estado muestra "En curso" o equivalente visual

#### Scenario: Tarjeta finalized

- **GIVEN** un `TutorExam` con `serverStatus.value === 'finalized'`
- **WHEN** la tarjeta se renderiza
- **THEN** el badge/estado muestra "Finalizado" o equivalente visual

---

### Requirement: Tap en tarjeta navega a /tutor/exams/:recordId

Al tocar una tarjeta, la app SHALL navegar a `/tutor/exams/<recordId>`. La VM o el componente SHALL usar `Router.navigate(['/tutor/exams', recordId])` o equivalente Angular.

#### Scenario: Tap en tarjeta navega a la ruta de gestión

- **GIVEN** una tarjeta con `recordId = "rec-1"`
- **WHEN** el usuario toca la tarjeta
- **THEN** el router navega a `/tutor/exams/rec-1`

#### Scenario: Tap en tarjeta NOT navega fuera de /tutor

- **GIVEN** una tarjeta cualquiera
- **WHEN** el usuario toca la tarjeta
- **THEN** la URL resultante sigue el patrón `/tutor/exams/<recordId>` (no `/tutor/home/:id` ni rutas del alumno)

---

### Requirement: Ruta /tutor/home — header completo con perfil, aulas y logout

La configuración de rutas SHALL modificar `/tutor/home` para cargar `TutorExamsListPage` (lazy `loadComponent`). El componente placeholder anterior SHALL ser eliminado o reemplazado. La página SHALL renderizar el perfil COMPLETO del tutor (nombre, email, código), la lista de aulas (`Mis aulas`) con ciclo y recuento de alumnos por aula, y un botón de logout — TODO por encima de la lista de exámenes.

El VM SHALL inyectar `GetProfileUseCase('tutor')` y exponer:
- `classrooms: Signal<readonly TutorClassroom[]>` — lista de aulas del perfil.
- `classroomCount: Signal<number>` — computed de `classrooms().length`.
- `studentTotal: Signal<number>` — computed de suma de `studentCount` por aula.
- `hasClassrooms: Signal<boolean>` — computed de `classrooms().length > 0`.
- `userCode: Signal<string | null>` — código interno del tutor.
- `profileEmail: Signal<string | null>` — email del perfil (puede diferir del identity email).
- `isSigningOut: Signal<boolean>` — estado de logout en progreso.
- `signOut(): Promise<void>` — invoca `LogoutUseCase.execute()` y navega a `/login`.

El VM SHALL también inyectar `LogoutUseCase` y `GetIdentityUseCase` (fallback de email en estado degraded).

#### Scenario: /tutor/home carga TutorExamsListPage

- **WHEN** el tutor navega a `/tutor/home`
- **THEN** `TutorExamsListPage` se renderiza
- **AND** el header de perfil del tutor es visible
- **AND** la lista de exámenes se carga

#### Scenario: Placeholder no existe tras el change

- **WHEN** se inspecciona el código fuente tras el change
- **THEN** no existe ningún componente de "Próximamente" / placeholder para `/tutor/home`

#### Scenario: Profile card muestra nombre, email y código del tutor

- **GIVEN** `GetProfileUseCase('tutor')` resuelve con un `TutorProfile`
- **WHEN** `TutorExamsListPage` renderiza
- **THEN** la profile card (data-testid="profile-card") muestra el nombre completo (`firstName lastName`)
- **AND** muestra el `profileEmail` o `userEmail` como fallback
- **AND** muestra el `code` del tutor (DNI / Código)

#### Scenario: Profile card — skeleton mientras carga

- **GIVEN** `profileLoading()` es `true`
- **WHEN** la página renderiza
- **THEN** se muestra el skeleton (data-testid="profile-skeleton") en lugar de la profile card

#### Scenario: Profile card — degraded cuando perfil no disponible

- **GIVEN** `profileUnavailable()` es `true`
- **WHEN** la página renderiza
- **THEN** se muestra la tarjeta degraded (data-testid="profile-card-degraded") con el email de identity como fallback

#### Scenario: Mis aulas — lista de aulas con nombre, ciclo y alumnos

- **GIVEN** el perfil tiene `classrooms = [aulA, aulaB]`
- **WHEN** `TutorExamsListPage` renderiza
- **THEN** se muestran dos filas (data-testid="classroom-item")
- **AND** cada fila muestra el `name` del aula
- **AND** cada fila muestra el `cycleName` del aula
- **AND** cada fila muestra el `studentCount` del aula

#### Scenario: Mis aulas — línea de resumen

- **GIVEN** el tutor tiene 2 aulas con 30 y 25 alumnos respectivamente
- **WHEN** la página renderiza
- **THEN** el resumen (data-testid="classrooms-summary") contiene "2" aulas y "55" alumnos

#### Scenario: Mis aulas — empty-state cuando no hay aulas

- **GIVEN** `classrooms()` está vacío
- **WHEN** la página renderiza
- **THEN** se muestra el empty-state (data-testid="classrooms-empty")

#### Scenario: DOM order — perfil y aulas ANTES de los exámenes

- **GIVEN** el perfil y los exámenes están disponibles
- **WHEN** la página renderiza
- **THEN** la profile card (data-testid="profile-card") aparece ANTES de la lista de exámenes (data-testid="exams-list") en el DOM
- **AND** la sección de aulas (data-testid="classrooms-section") aparece ANTES de la lista de exámenes

#### Scenario: Logout — botón "Cerrar sesión" existe y funciona

- **WHEN** la página renderiza
- **THEN** existe el botón de logout (data-testid="btn-logout")

- **GIVEN** el tutor hace click en "Cerrar sesión"
- **WHEN** `signOut()` es invocado
- **THEN** `LogoutUseCase.execute()` es llamado una vez
- **AND** la app navega a `/login`

#### Scenario: Logout — botón disabled durante logout en progreso

- **GIVEN** `isSigningOut()` es `true`
- **WHEN** la página renderiza
- **THEN** el botón (data-testid="btn-logout") está `disabled`

---

### Requirement: TutorExamsListPage provee la VM como provider local

`TutorExamsListPage` SHALL declarar `providers: [TutorExamsListViewModel]` en su decorador `@Component`. El VM SHALL NOT ser `providedIn: 'root'`.

#### Scenario: VM es local al componente page

- **WHEN** se inspecciona el decorador de `TutorExamsListPage`
- **THEN** `TutorExamsListViewModel` aparece en `providers: [...]`
- **AND** `TutorExamsListViewModel` no tiene `providedIn: 'root'` en su decorador (si lo tiene)
