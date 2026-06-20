# Delta for route-protection (tutor-exam-management)

> Esta capability es **MODIFICADA**. Este delta es ADITIVO y no-breaking — no altera ni elimina ninguno de los Requirements existentes en `openspec/specs/route-protection/spec.md`.
> Al archivar este change, este delta se fusiona en `openspec/specs/route-protection/spec.md`.

## ADDED Requirements

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

Las rutas existentes del alumno (`/student/home`, `/student/simulacro/:id`, `/login`, redirects legacy) SHALL permanecer sin modificación tras este change. El change es estrictamente ADITIVO para las rutas del alumno.

#### Scenario: Rutas del alumno no modificadas

- **WHEN** se inspecciona `app.routes.ts` tras el change
- **THEN** las rutas `/student/home`, `/student/simulacro/:id`, `/login`, `/home` (legacy), `/simulacro/:id` (legacy) son idénticas a las previas al change
- **AND** sus guards y componentes no han sido alterados

#### Scenario: roleGuard del tutor no afecta al alumno en /student/home

- **GIVEN** el usuario está autenticado con `role = "student"`
- **WHEN** navega a `/student/home`
- **THEN** la navegación es exitosa (roleGuard('student') la permite)
- **AND** el nuevo roleGuard del tutor no interfiere
