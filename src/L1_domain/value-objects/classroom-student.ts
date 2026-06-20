// Alumno del aula con su estado de habilitación para el virtual exam.
// Mapeado 1:1 desde ClassroomStudentDto en L3.
// `hasSubmitted` es inmutable desde la perspectiva del tutor: si es true,
// el checkbox de habilitación se deshabilita (D5).
export interface ClassroomStudent {
  readonly studentId: string;
  readonly studentCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly enabled: boolean;
  readonly hasSubmitted: boolean;
}
