// Value-object que representa el perfil del alumno, obtenido de GET /t/{slug}/student/me.
// `code` es el DNI peruano del alumno (ej. "79507732").
// `area` puede ser null si el alumno aún no rindió ningún examen.
// Nota: `id` es el Student.id, distinto de Identity.id (TenantUser.id).
export interface StudentProfile {
  readonly id: string;
  readonly code: string; // DNI peruano (ej. "79507732")
  readonly firstName: string;
  readonly lastName: string;
  readonly area: string | null; // null si el alumno no rindió examen aún
}
