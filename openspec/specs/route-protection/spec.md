# route-protection — Delta Spec (fase-3-login-learnex)

## REMOVED Requirements

### Requirement ELIMINADO: Las rutas protegidas exigen sesión activa — `/home` único

La ruta `/home` genérica deja de ser la ruta protegida canónica. Reemplazada por `/student/home` y `/tutor/home` con guards diferenciados.

### Requirement ELIMINADO: Las rutas públicas son accesibles — redirect a `/home`

`publicOnlyGuard` ya no redirige a `/home` genérico. Redirige a `/${identity.role()}/home`.

### Requirement ELIMINADO: La raíz `/` redirige según el estado de sesión

El redirect desde `/` queda fuera del scope de este change (puede seguir existiendo como redirect estático a `/login` o eliminarse). No se especifica en este delta.

### Requirement ELIMINADO: El guard depende de `GetActiveSessionUseCase`

Reemplazado por `GetIdentityUseCase`.

---

## ADDED Requirements

### Requirement: `authGuard` consume `GetIdentityUseCase`

`authGuard` SHALL consultar la identity activa a través de `GetIdentityUseCase` (L2). Si `GetIdentityUseCase.execute()` devuelve `null` → redirige a `/login`. Si devuelve `Identity` → permite la navegación.

#### Scenario: Usuario autenticado accede a ruta protegida

- **WHEN** `GetIdentityUseCase.execute()` devuelve `Identity` y el usuario navega a `/student/home`
- **THEN** el componente de `/student/home` se renderiza

#### Scenario: Usuario no autenticado intenta acceder a ruta protegida

- **WHEN** `GetIdentityUseCase.execute()` devuelve `null` y el usuario navega a `/student/home`
- **THEN** la navegación es redirigida a `/login`
- **AND** el componente de `/student/home` no se instancia

#### Scenario: El guard no importa storage

- **WHEN** se inspecciona el código de `authGuard`
- **THEN** no importa directamente `IdentityStorage` ni `LocalStorageIdentityStorage`
- **AND** depende de `GetIdentityUseCase` por DI

### Requirement: `publicOnlyGuard` redirige a `/${identity.role()}/home`

`publicOnlyGuard` SHALL consultar `GetIdentityUseCase`. Si existe identity → redirige a `/${identity.role()}/home`. Si no existe → permite la navegación (muestra el login).

#### Scenario: Acceso no autenticado a `/login`

- **WHEN** `GetIdentityUseCase.execute()` devuelve `null` y el usuario navega a `/login`
- **THEN** el componente de login se renderiza

#### Scenario: Acceso autenticado a `/login` — redirect a home del rol

- **WHEN** `GetIdentityUseCase.execute()` devuelve `Identity` con `roles: ["student"]` y el usuario navega a `/login`
- **THEN** la navegación es redirigida a `/student/home`

- **WHEN** `GetIdentityUseCase.execute()` devuelve `Identity` con `roles: ["tutor"]` y el usuario navega a `/login`
- **THEN** la navegación es redirigida a `/tutor/home`

### Requirement: `roleGuard` — guard funcional de rol

El sistema SHALL exponer un `roleGuard(role: 'student' | 'tutor')` functional guard factory. Su lógica:

1. Consulta `GetIdentityUseCase`.
2. Si no hay identity → redirige a `/login`.
3. Si hay identity pero `identity.role() !== role` → redirige a `/${identity.role()}/home` (rol incorrecto para esta ruta).
4. Si hay identity y `identity.role() === role` → permite la navegación.

#### Scenario: Alumno accede a `/student/home` — permitido

- **WHEN** `identity.role() === "student"` y el usuario navega a `/student/home`
- **THEN** el componente de `/student/home` se renderiza

#### Scenario: Alumno intenta acceder a `/tutor/home` — redirigido

- **WHEN** `identity.role() === "student"` y el usuario navega a `/tutor/home`
- **THEN** la navegación es redirigida a `/student/home`

#### Scenario: Tutor intenta acceder a `/student/simulacro/:id` — redirigido

- **WHEN** `identity.role() === "tutor"` y el usuario navega a `/student/simulacro/abc`
- **THEN** la navegación es redirigida a `/tutor/home`

#### Scenario: Sin identity → redirige a `/login`

- **WHEN** `GetIdentityUseCase.execute()` devuelve `null` y el usuario navega a `/student/home`
- **THEN** la navegación es redirigida a `/login`

### Requirement: Routing config con prefijo de rol

La configuración de rutas del router SHALL incluir:

| Ruta | Guards aplicados | Destino |
|---|---|---|
| `/login` | `publicOnlyGuard` | `LoginPage` |
| `/student/home` | `authGuard` + `roleGuard('student')` | `StudentHomePage` |
| `/student/simulacro/:id` | `authGuard` + `roleGuard('student')` | `ExamMarkingPage` |
| `/tutor/home` | `authGuard` + `roleGuard('tutor')` | `TutorHomePage` |
| `/home` (legacy) | — | redirect condicional según identity |
| `/simulacro/:id` (legacy) | — | redirect a `/student/simulacro/:id` |

#### Scenario: Auth student user accede a `/student/home`

- **WHEN** el usuario está autenticado como alumno y navega a `/student/home`
- **THEN** `StudentHomePage` se renderiza

#### Scenario: Auth student user accede a `/tutor/home`

- **WHEN** el usuario está autenticado como alumno y navega a `/tutor/home`
- **THEN** la navegación es redirigida a `/student/home`

#### Scenario: Auth tutor user accede a `/student/simulacro/abc`

- **WHEN** el usuario está autenticado como tutor y navega a `/student/simulacro/abc`
- **THEN** la navegación es redirigida a `/tutor/home`

#### Scenario: Auth student user accede a `/login`

- **WHEN** el usuario está autenticado como alumno y navega a `/login`
- **THEN** la navegación es redirigida a `/student/home`

#### Scenario: Unauth user accede a `/student/home`

- **WHEN** no hay identity y el usuario navega a `/student/home`
- **THEN** la navegación es redirigida a `/login`

#### Scenario: Unauth user accede a `/login`

- **WHEN** no hay identity y el usuario navega a `/login`
- **THEN** el formulario de login se renderiza

### Requirement: Redirects legacy desde `/home` y `/simulacro/:id`

La ruta `/home` SHALL redirigir condicionalmente: si existe identity → a `/${identity.role()}/home`; si no → a `/login`. La ruta `/simulacro/:id` SHALL redirigir siempre a `/student/simulacro/:id` (el `roleGuard('student')` de esa ruta manejará el caso de un tutor).

#### Scenario: Auth user entra a `/home` legacy — redirect a home del rol

- **WHEN** el usuario está autenticado como alumno y navega a `/home`
- **THEN** la navegación es redirigida a `/student/home`

- **WHEN** el usuario está autenticado como tutor y navega a `/home`
- **THEN** la navegación es redirigida a `/tutor/home`

#### Scenario: Unauth user entra a `/home` legacy — redirect a `/login`

- **WHEN** no hay identity y el usuario navega a `/home`
- **THEN** la navegación es redirigida a `/login`

#### Scenario: Auth student user entra a `/simulacro/abc` legacy — redirect a `/student/simulacro/abc`

- **WHEN** el usuario está autenticado como alumno y navega a `/simulacro/abc`
- **THEN** la navegación es redirigida a `/student/simulacro/abc`
- **AND** la ruta `/student/simulacro/abc` se renderiza normalmente

#### Scenario: Auth tutor user entra a `/simulacro/abc` legacy — redirigido por roleGuard

- **WHEN** el usuario está autenticado como tutor y navega a `/simulacro/abc`
- **THEN** la navegación pasa primero por el redirect a `/student/simulacro/abc`
- **AND** `roleGuard('student')` detecta que el rol es tutor
- **AND** la navegación es redirigida a `/tutor/home`

---

### Requirement: /tutor/home carga TutorExamsListPage (reemplaza placeholder)

La configuración de rutas (`app.routes.ts`) SHALL actualizar la entrada para `/tutor/home` de forma que:
- Cargue `TutorExamsListPage` vía `loadComponent` (lazy).
- Aplique `canActivate: [authGuard, roleGuard('tutor')]` — mismo patrón que las rutas existentes del tutor.
- La entrada es una MODIFICACIÓN de la ruta existente, NOT una nueva ruta.

La ruta `/tutor/home` ya existía (con un componente placeholder o `TutorHomePage` sin funcionalidad de lista). Este requirement la actualiza al componente real.

#### Scenario: /tutor/home carga el componente de lista correcto

- **WHEN** se inspecciona `app.routes.ts`
- **THEN** la ruta `/tutor/home` tiene `loadComponent` apuntando a `TutorExamsListPage`
- **AND** tiene `canActivate: [authGuard, roleGuard('tutor')]`
- **AND** es lazy (usa `loadComponent`, no `component` estático)

#### Scenario: Tutor autenticado navega a /tutor/home — renderiza la lista

- **GIVEN** el usuario está autenticado con `role = "tutor"`
- **WHEN** navega a `/tutor/home`
- **THEN** `TutorExamsListPage` se renderiza
- **AND** la lista de exámenes virtuales del tutor se carga

#### Scenario: Alumno intenta acceder a /tutor/home — redirigido (roleGuard)

- **GIVEN** el usuario está autenticado con `role = "student"`
- **WHEN** navega a `/tutor/home`
- **THEN** `roleGuard('tutor')` detecta el rol incorrecto
- **AND** la navegación es redirigida a `/student/home`

#### Scenario: Usuario no autenticado intenta /tutor/home — redirigido a login (authGuard)

- **GIVEN** no existe identity en sesión
- **WHEN** navega a `/tutor/home`
- **THEN** `authGuard` redirige a `/login`
- **AND** `TutorExamsListPage` no se instancia

---

### Requirement: Nueva ruta /tutor/exams/:recordId — gestión del examen

La configuración de rutas SHALL agregar una NUEVA entrada:

| Ruta | Guards | Componente |
|---|---|---|
| `/tutor/exams/:recordId` | `[authGuard, roleGuard('tutor')]` | `TutorExamDetailPage` (lazy `loadComponent`) |

El parámetro `:recordId` es el `exam_traceability_record.id` (ver `TutorExam.recordId`). La ruta SHALL estar agrupada lógicamente con las rutas del tutor en `app.routes.ts`.

#### Scenario: Nueva ruta /tutor/exams/:recordId existe en la config

- **WHEN** se inspecciona `app.routes.ts`
- **THEN** existe una entrada con `path: 'tutor/exams/:recordId'`
- **AND** tiene `loadComponent` apuntando a `TutorExamDetailPage`
- **AND** tiene `canActivate: [authGuard, roleGuard('tutor')]`

#### Scenario: Tutor autenticado navega a /tutor/exams/rec-1 — renderiza gestión

- **GIVEN** el usuario está autenticado con `role = "tutor"`
- **WHEN** navega a `/tutor/exams/rec-1`
- **THEN** `TutorExamDetailPage` se renderiza
- **AND** `TutorExamDetailViewModel` recibe `recordId = "rec-1"` desde los route params

#### Scenario: Deep-link directo a /tutor/exams/:recordId — authGuard y roleGuard se aplican

- **GIVEN** el usuario accede directamente a `/tutor/exams/rec-1` (sin pasar por /tutor/home)
- **AND** el usuario está autenticado como tutor
- **WHEN** el router resuelve la ruta
- **THEN** `authGuard` permite el acceso
- **AND** `roleGuard('tutor')` permite el acceso
- **AND** `TutorExamDetailPage` se renderiza
- **AND** el VM activa el fallback de refetch (store vacío → refetch lista para resolver classroomId)

#### Scenario: Alumno intenta acceder a /tutor/exams/:recordId — redirigido

- **GIVEN** el usuario está autenticado con `role = "student"`
- **WHEN** navega a `/tutor/exams/rec-1`
- **THEN** `roleGuard('tutor')` redirige a `/student/home`

#### Scenario: Usuario no autenticado intenta /tutor/exams/:recordId — redirigido a login

- **GIVEN** no existe identity en sesión
- **WHEN** navega a `/tutor/exams/rec-1`
- **THEN** `authGuard` redirige a `/login`

---

### Requirement: Rutas del alumno sin cambios

Las rutas existentes del alumno (`/student/home`, `/student/simulacro/:id`, `/login`, redirects legacy) SHALL permanecer sin modificación tras el change `tutor-exam-management`. El change es estrictamente ADITIVO para las rutas del alumno.

#### Scenario: Rutas del alumno no modificadas

- **WHEN** se inspecciona `app.routes.ts` tras el change
- **THEN** las rutas `/student/home`, `/student/simulacro/:id`, `/login`, `/home` (legacy), `/simulacro/:id` (legacy) son idénticas a las previas al change
- **AND** sus guards y componentes no han sido alterados

#### Scenario: roleGuard del tutor no afecta al alumno en /student/home

- **GIVEN** el usuario está autenticado con `role = "student"`
- **WHEN** navega a `/student/home`
- **THEN** la navegación es exitosa (roleGuard('student') la permite)
- **AND** el nuevo roleGuard del tutor no interfiere
