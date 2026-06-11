import { Injectable } from '@angular/core';
import { SessionStorage } from '../../L1_domain/ports/session-storage';
import { Session } from '../../L1_domain/entities/session';
import { BearerToken } from '../../L1_domain/value-objects/bearer-token';

const STORAGE_KEY = 'neonpanda.session';

interface PersistedShape {
  bearerToken?: string;
  userEmail?: string;
  issuedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class LocalStorageSessionStorage implements SessionStorage {
  async read(): Promise<Session | null> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    let parsed: PersistedShape;
    try {
      parsed = JSON.parse(raw) as PersistedShape;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (!parsed?.bearerToken || !parsed?.userEmail || !parsed?.issuedAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const issuedAt = new Date(parsed.issuedAt);
    if (Number.isNaN(issuedAt.getTime())) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    try {
      return new Session(new BearerToken(parsed.bearerToken), parsed.userEmail, issuedAt);
    } catch {
      // Datos sintácticamente válidos pero violan invariantes del dominio.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  async write(session: Session): Promise<void> {
    const data: PersistedShape = {
      bearerToken: session.bearerToken.value,
      userEmail: session.userEmail,
      issuedAt: session.issuedAt.toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
  }
}
