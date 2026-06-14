// Fake in-memory del puerto `IdentityStorage` para tests de L2.
// Registra el orden de operaciones con `bindOpsLog` para verificar secuencias.

import { IdentityStorage } from '../../../src/L1_domain/ports/identity-storage';
import { Identity } from '../../../src/L1_domain/entities/identity';

export class FakeIdentityStorage implements IdentityStorage {
  private store: Identity | null = null;
  private sharedOpsLog: string[] | null = null;

  bindOpsLog(log: string[]): void {
    this.sharedOpsLog = log;
  }

  async read(): Promise<Identity | null> {
    return this.store;
  }

  async write(identity: Identity): Promise<void> {
    this.sharedOpsLog?.push('identity.write');
    this.store = identity;
  }

  async clear(): Promise<void> {
    this.sharedOpsLog?.push('identity.clear');
    this.store = null;
  }
}
