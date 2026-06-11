import { SessionStorage } from '../../L1_domain/ports/session-storage';
import { Session } from '../../L1_domain/entities/session';

export class GetActiveSessionUseCase {
  constructor(private readonly storage: SessionStorage) {}

  // En Fase 1 delega al storage (que ya garantiza `null` si los datos están
  // corruptos o ausentes — ver SessionStorage port). El use case se mantiene
  // como punto de extensión: Fase 2 puede agregar validación contra
  // `/auth/me` para detectar tokens revocados server-side antes de devolver.
  async execute(): Promise<Session | null> {
    return this.storage.read();
  }
}
