import { Session } from '../entities/session';

// Puerto del dominio para persistencia local de la sesión activa.
// Implementación concreta vive en L3 (`LocalStorageSessionStorage`).
// El contrato exige que `read()` devuelva `null` si los datos persistidos
// no se pueden reconstruir a una Session válida (corrupto o ausente).
export interface SessionStorage {
  read(): Promise<Session | null>;
  write(session: Session): Promise<void>;
  clear(): Promise<void>;
}
