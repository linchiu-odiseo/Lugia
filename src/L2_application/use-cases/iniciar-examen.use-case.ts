import { TutorExamsApi } from '../../L1_domain/ports/tutor-exams-api';

// Inicia un virtual exam (scheduled → in_progress).
// Online-only (D3): no hay outbox. Una NetworkError le llega al VM que
// muestra el error + botón reintentar.
// El backend rechazará con 422 si 0 alumnos habilitados o claves no
// configuradas; el VM también lo previene con el guard D5.
export class IniciarExamenUseCase {
  constructor(private readonly api: TutorExamsApi) {}

  async execute(req: { recordId: string }): Promise<void> {
    return this.api.iniciar(req.recordId);
  }
}
