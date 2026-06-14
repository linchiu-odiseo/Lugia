import { Identity } from '../entities/identity';

// Puerto del dominio para persistencia local de la identidad autenticada.
// Reemplaza a `SessionStorage`. Implementación concreta: `LocalStorageIdentityStorage` en L3.
// `read()` devuelve `null` si los datos persistidos están ausentes, corruptos o
// no se pueden reconstruir a una `Identity` válida.
export interface IdentityStorage {
  read(): Promise<Identity | null>;
  write(identity: Identity): Promise<void>;
  clear(): Promise<void>;
}
