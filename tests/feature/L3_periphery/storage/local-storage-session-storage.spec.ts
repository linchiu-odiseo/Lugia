import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalStorageSessionStorage } from '../../../../src/L3_periphery/storage/local-storage-session-storage';
import { Session } from '../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';

const STORAGE_KEY = 'neonpanda.session';

describe('LocalStorageSessionStorage', () => {
  let storage: LocalStorageSessionStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new LocalStorageSessionStorage();
  });

  afterEach(() => localStorage.clear());

  describe('write + read (roundtrip)', () => {
    it('persiste y devuelve la Session', async () => {
      const session = new Session(
        new BearerToken('6|abc'),
        'fulano@panda.test',
        new Date('2026-06-11T12:00:00Z'),
      );
      await storage.write(session);
      const restored = await storage.read();
      expect(restored?.bearerToken.value).toBe('6|abc');
      expect(restored?.userEmail).toBe('fulano@panda.test');
      expect(restored?.issuedAt.toISOString()).toBe('2026-06-11T12:00:00.000Z');
    });

    it('usa la clave exacta `neonpanda.session`', async () => {
      const session = new Session(new BearerToken('6|abc'), 'a@b.com', new Date());
      await storage.write(session);
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
  });

  describe('read sin datos', () => {
    it('devuelve null si la clave no existe', async () => {
      expect(await storage.read()).toBeNull();
    });
  });

  describe('read con datos corruptos', () => {
    it('devuelve null y elimina la clave si el JSON es inválido', async () => {
      localStorage.setItem(STORAGE_KEY, 'no-soy-json{');
      expect(await storage.read()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('devuelve null y elimina si falta bearerToken', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ userEmail: 'a@b.com', issuedAt: new Date().toISOString() }),
      );
      expect(await storage.read()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('devuelve null y elimina si falta userEmail', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bearerToken: '6|abc', issuedAt: new Date().toISOString() }),
      );
      expect(await storage.read()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('devuelve null y elimina si falta issuedAt', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bearerToken: '6|abc', userEmail: 'a@b.com' }),
      );
      expect(await storage.read()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('devuelve null y elimina si issuedAt es no-fecha', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bearerToken: '6|abc', userEmail: 'a@b.com', issuedAt: 'no-soy-fecha' }),
      );
      expect(await storage.read()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('devuelve null y elimina si bearerToken viola invariantes del dominio', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bearerToken: '', userEmail: 'a@b.com', issuedAt: new Date().toISOString() }),
      );
      expect(await storage.read()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('clear', () => {
    it('elimina la clave del storage', async () => {
      const session = new Session(new BearerToken('6|abc'), 'a@b.com', new Date());
      await storage.write(session);
      await storage.clear();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(await storage.read()).toBeNull();
    });

    it('es idempotente: clear sin datos no falla', async () => {
      await expect(storage.clear()).resolves.toBeUndefined();
    });
  });
});
