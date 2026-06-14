// Fake in-memory del puerto `ProfileStorage` para tests de L2.
// `cachedAt` es configurable para simular cache fresco vs. stale.

import { ProfileStorage, CachedProfile } from '../../../src/L1_domain/ports/profile-storage';
import { Role } from '../../../src/L1_domain/entities/identity';
import { StudentProfile } from '../../../src/L1_domain/value-objects/student-profile';
import { TutorProfile } from '../../../src/L1_domain/value-objects/tutor-profile';

export class FakeProfileStorage implements ProfileStorage {
  private store = new Map<Role, CachedProfile>();
  private clearCalls = 0;

  /** Siembra directa con `cachedAt` configurable para tests de TTL. */
  seed(role: Role, profile: StudentProfile | TutorProfile, cachedAt: number): void {
    this.store.set(role, { profile, cachedAt });
  }

  getClearCalls(): number {
    return this.clearCalls;
  }

  async read(role: Role): Promise<CachedProfile | null> {
    return this.store.get(role) ?? null;
  }

  async write(role: Role, profile: StudentProfile | TutorProfile): Promise<void> {
    this.store.set(role, { profile, cachedAt: Date.now() });
  }

  async clear(): Promise<void> {
    this.clearCalls++;
    this.store.clear();
  }
}
