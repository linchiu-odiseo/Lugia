// Value-objects que representan el perfil del tutor y sus aulas,
// obtenidos de GET /t/{slug}/tutor/me.
// `TutorProfile.code` es el código interno del tutor (ej. "T001"), no el DNI.
// `classrooms` puede ser [] si el tutor no tiene aulas asignadas.
// Nota: `id` es el Tutor.id, distinto de Identity.id (TenantUser.id).

export interface TutorClassroom {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly modality: 'presencial' | 'virtual';
  readonly shift: 'manana' | 'tarde' | 'noche';
  readonly campusName: string | null;
  readonly cycleId: string;
  readonly cycleName: string;
  readonly studentCount: number;
}

export interface TutorProfile {
  readonly id: string;
  readonly code: string; // Código interno del tutor (ej. "T001")
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly classrooms: readonly TutorClassroom[]; // puede ser []
}
