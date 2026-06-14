// Tests del adapter L3 `IndexedDbMarkingsStorage`.
//
// Cubre los scenarios del spec `offline-storage` y el fix de layer
// violation introducido en PR2 de `fase-3-login-learnex`:
// - El adapter ya NO depende de `LocalStorageSessionStorage` (clase
//   concreta). Inyecta `IdentityStorage` (port) vía el token `IDENTITY_STORAGE`.
// - El `email` del scope viene de `identity.email`.
// - `wipeUserScope()` sin identity = no-op (no lanza).
// - `clear()` (OutboxStoragePort) sin identity = no-op.
//
// `fake-indexeddb/auto` reemplaza `globalThis.indexedDB` al importarse.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { IndexedDbMarkingsStorage } from '../../../../src/L3_periphery/storage/indexed-db-markings-storage';
import { IDENTITY_STORAGE } from '../../../../src/L3_periphery/tokens';
import { IdentityStorage } from '../../../../src/L1_domain/ports/identity-storage';
import { Identity } from '../../../../src/L1_domain/entities/identity';
import { OfflineStorageUnavailableError } from '../../../../src/L1_domain/errors/offline-storage-unavailable.error';

const DB_NAME = 'lugia-cartilla';
const STORE = 'data';

// Doble manual del port `IdentityStorage`. Permite alternar la identity
// "activa" entre tests sin tocar IndexedDB ni localStorage real.
class StubIdentityStorage implements IdentityStorage {
  private current: Identity | null = null;

  setIdentity(i: Identity | null): void {
    this.current = i;
  }

  async read(): Promise<Identity | null> {
    return this.current;
  }

  async write(identity: Identity): Promise<void> {
    this.current = identity;
  }

  async clear(): Promise<void> {
    this.current = null;
  }
}

function makeIdentity(email: string): Identity {
  return new Identity(
    'user-id',
    'tenant-id',
    email,
    '79507732',
    ['student'],
    [],
    Date.now() + 900_000,
  );
}

// Vacía el único object store entre tests (mismo patrón que el spec viejo).
function wipeAllKeys(): Promise<void> {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(DB_NAME);
    openReq.onupgradeneeded = () => {
      const db = openReq.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    openReq.onsuccess = () => {
      const db = openReq.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        resolve();
        return;
      }
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    openReq.onerror = () => reject(openReq.error);
  });
}

describe('IndexedDbMarkingsStorage', () => {
  let identityStorage: StubIdentityStorage;
  let adapter: IndexedDbMarkingsStorage;

  beforeEach(async () => {
    await wipeAllKeys();
    identityStorage = new StubIdentityStorage();
    identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        IndexedDbMarkingsStorage,
        { provide: IDENTITY_STORAGE, useValue: identityStorage },
      ],
    });
    adapter = TestBed.inject(IndexedDbMarkingsStorage);
  });

  afterEach(async () => {
    await wipeAllKeys();
  });

  describe('marcaciones — operaciones básicas', () => {
    it('persiste una marcación y la devuelve en getMarcaciones', async () => {
      await adapter.setMarcacion('sim-1', 5, 'C');
      const map = await adapter.getMarcaciones('sim-1');
      expect(map).toEqual({ '5': 'C' });
    });

    it('cambia la alternativa al sobreescribir la misma pregunta', async () => {
      await adapter.setMarcacion('sim-1', 5, 'C');
      await adapter.setMarcacion('sim-1', 5, 'A');
      const map = await adapter.getMarcaciones('sim-1');
      expect(map).toEqual({ '5': 'A' });
    });

    it('desmarcar (alternativa=null) deja el valor null en el map', async () => {
      await adapter.setMarcacion('sim-1', 5, 'C');
      await adapter.setMarcacion('sim-1', 5, null);
      const map = await adapter.getMarcaciones('sim-1');
      expect(map).toEqual({ '5': null });
    });

    it('getMarcaciones de un simulacro sin marcas devuelve objeto vacío', async () => {
      const map = await adapter.getMarcaciones('sim-vacio');
      expect(map).toEqual({});
    });

    it('persiste múltiples preguntas del mismo simulacro', async () => {
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-1', 2, 'B');
      await adapter.setMarcacion('sim-1', 3, null);
      const map = await adapter.getMarcaciones('sim-1');
      expect(map).toEqual({ '1': 'A', '2': 'B', '3': null });
    });

    it('clearMarcaciones vacía un simulacro sin tocar otros del mismo usuario', async () => {
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-1', 2, 'B');
      await adapter.setMarcacion('sim-2', 1, 'C');

      await adapter.clearMarcaciones('sim-1');

      expect(await adapter.getMarcaciones('sim-1')).toEqual({});
      expect(await adapter.getMarcaciones('sim-2')).toEqual({ '1': 'C' });
    });
  });

  describe('scope por email (vía IdentityStorage)', () => {
    it('usuario B no ve marcaciones del usuario A', async () => {
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-1', 2, 'B');

      identityStorage.setIdentity(makeIdentity('alumno-b@vonex.edu.pe'));
      const mapB = await adapter.getMarcaciones('sim-1');
      expect(mapB).toEqual({});

      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      const mapA = await adapter.getMarcaciones('sim-1');
      expect(mapA).toEqual({ '1': 'A', '2': 'B' });
    });

    it('wipeUserScope de B no afecta los datos de A', async () => {
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      identityStorage.setIdentity(makeIdentity('alumno-b@vonex.edu.pe'));
      await adapter.setMarcacion('sim-9', 1, 'D');
      await adapter.wipeUserScope();

      // B quedó vacío.
      expect(await adapter.getMarcaciones('sim-9')).toEqual({});
      expect(await adapter.getEnviosPendientes()).toEqual([]);

      // A intacto.
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      expect(await adapter.getMarcaciones('sim-1')).toEqual({ '1': 'A' });
      expect(await adapter.getEnviosPendientes()).toEqual([
        {
          simulacroId: 'sim-1',
          answers: { '1': 'A' },
          clientSubmittedAt: '2026-06-11T12:00:00.000Z',
        },
      ]);
    });

    it('wipeUserScope borra marcaciones Y cola del usuario actual', async () => {
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-2', 1, 'B');
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      await adapter.wipeUserScope();

      expect(await adapter.getMarcaciones('sim-1')).toEqual({});
      expect(await adapter.getMarcaciones('sim-2')).toEqual({});
      expect(await adapter.getEnviosPendientes()).toEqual([]);
    });
  });

  describe('cola de envíos pendientes', () => {
    it('enqueueEnvio + getEnviosPendientes roundtrip', async () => {
      const envio = {
        simulacroId: 'sim-1',
        answers: { '1': 'A' as const, '2': null },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      };
      await adapter.enqueueEnvio(envio);
      const pending = await adapter.getEnviosPendientes();
      expect(pending).toEqual([envio]);
    });

    it('getEnviosPendientes devuelve [] cuando la cola está vacía', async () => {
      expect(await adapter.getEnviosPendientes()).toEqual([]);
    });

    it('enqueueEnvio del mismo simulacroId sobreescribe el envío previo', async () => {
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'B' },
        clientSubmittedAt: '2026-06-11T12:05:00.000Z',
      });
      const pending = await adapter.getEnviosPendientes();
      expect(pending).toHaveLength(1);
      expect(pending[0].answers).toEqual({ '1': 'B' });
    });

    it('dequeueEnvio elimina sólo el simulacroId indicado', async () => {
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });
      await adapter.enqueueEnvio({
        simulacroId: 'sim-2',
        answers: { '1': 'B' },
        clientSubmittedAt: '2026-06-11T12:05:00.000Z',
      });

      await adapter.dequeueEnvio('sim-1');

      const pending = await adapter.getEnviosPendientes();
      expect(pending).toHaveLength(1);
      expect(pending[0].simulacroId).toBe('sim-2');
    });
  });

  describe('IndexedDB no disponible', () => {
    it('rechaza con OfflineStorageUnavailableError si indexedDB es undefined', async () => {
      const g = globalThis as unknown as { indexedDB?: IDBFactory };
      const saved = g.indexedDB;
      g.indexedDB = undefined;
      try {
        TestBed.resetTestingModule();
        const freshIdentity = new StubIdentityStorage();
        freshIdentity.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
        TestBed.configureTestingModule({
          providers: [
            IndexedDbMarkingsStorage,
            { provide: IDENTITY_STORAGE, useValue: freshIdentity },
          ],
        });
        const fresh = TestBed.inject(IndexedDbMarkingsStorage);

        await expect(fresh.setMarcacion('sim-1', 1, 'A')).rejects.toBeInstanceOf(
          OfflineStorageUnavailableError,
        );
        await expect(fresh.getMarcaciones('sim-1')).rejects.toBeInstanceOf(
          OfflineStorageUnavailableError,
        );
        await expect(
          fresh.enqueueEnvio({
            simulacroId: 'sim-1',
            answers: {},
            clientSubmittedAt: '2026-06-11T12:00:00.000Z',
          }),
        ).rejects.toBeInstanceOf(OfflineStorageUnavailableError);
        await expect(fresh.wipeUserScope()).rejects.toBeInstanceOf(OfflineStorageUnavailableError);
      } finally {
        g.indexedDB = saved;
      }
    });
  });

  describe('sin identity activa', () => {
    it('setMarcacion rechaza con OfflineStorageUnavailableError', async () => {
      identityStorage.setIdentity(null);
      await expect(adapter.setMarcacion('sim-1', 1, 'A')).rejects.toBeInstanceOf(
        OfflineStorageUnavailableError,
      );
    });

    // Scenario explícito del spec session-storage:
    // "Wipe user scope sin identity es no-op".
    it('wipeUserScope sin identity es no-op (no lanza, no borra nada)', async () => {
      // Primero dejamos datos de A.
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      // Ahora sin identity → wipe no debe lanzar ni borrar.
      identityStorage.setIdentity(null);
      await expect(adapter.wipeUserScope()).resolves.toBeUndefined();

      // Reponemos identity de A y verificamos que los datos siguen intactos.
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      expect(await adapter.getMarcaciones('sim-1')).toEqual({ '1': 'A' });
      expect(await adapter.getEnviosPendientes()).toHaveLength(1);
    });

    it('clear (OutboxStoragePort) sin identity es no-op (no lanza, no borra nada)', async () => {
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      identityStorage.setIdentity(null);
      await expect(adapter.clear()).resolves.toBeUndefined();

      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      expect(await adapter.getEnviosPendientes()).toHaveLength(1);
    });
  });

  describe('clear (OutboxStoragePort) — comportamiento con identity', () => {
    // El nuevo método `clear()` exigido por `OutboxStoragePort` borra
    // SOLO la cola (`cartilla.<email>.queue.*`), preserva marcaciones.
    it('borra sólo cartilla.<email>.queue.* y preserva las marcaciones', async () => {
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-2', 1, 'B');
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });
      await adapter.enqueueEnvio({
        simulacroId: 'sim-2',
        answers: { '1': 'B' },
        clientSubmittedAt: '2026-06-11T12:05:00.000Z',
      });

      await adapter.clear();

      // Cola vacía…
      expect(await adapter.getEnviosPendientes()).toEqual([]);
      // …pero las marcaciones siguen ahí (las borra wipeUserScope, no clear).
      expect(await adapter.getMarcaciones('sim-1')).toEqual({ '1': 'A' });
      expect(await adapter.getMarcaciones('sim-2')).toEqual({ '1': 'B' });
    });

    it('clear NO afecta la cola de otro usuario', async () => {
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      identityStorage.setIdentity(makeIdentity('alumno-b@vonex.edu.pe'));
      await adapter.enqueueEnvio({
        simulacroId: 'sim-9',
        answers: { '1': 'D' },
        clientSubmittedAt: '2026-06-11T13:00:00.000Z',
      });
      await adapter.clear();

      // B vacío.
      expect(await adapter.getEnviosPendientes()).toEqual([]);
      // A sigue con su cola.
      identityStorage.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      expect(await adapter.getEnviosPendientes()).toHaveLength(1);
    });
  });

  describe('recuperación tras cierre de app', () => {
    it('marcaciones persisten al reabrir el adapter (mismo DB)', async () => {
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-1', 2, 'B');

      TestBed.resetTestingModule();
      const reopenedIdentity = new StubIdentityStorage();
      reopenedIdentity.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      TestBed.configureTestingModule({
        providers: [
          IndexedDbMarkingsStorage,
          { provide: IDENTITY_STORAGE, useValue: reopenedIdentity },
        ],
      });
      const reopened = TestBed.inject(IndexedDbMarkingsStorage);

      expect(await reopened.getMarcaciones('sim-1')).toEqual({ '1': 'A', '2': 'B' });
    });

    it('cola de envíos pendientes persiste al reabrir el adapter', async () => {
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      TestBed.resetTestingModule();
      const reopenedIdentity = new StubIdentityStorage();
      reopenedIdentity.setIdentity(makeIdentity('alumno-a@vonex.edu.pe'));
      TestBed.configureTestingModule({
        providers: [
          IndexedDbMarkingsStorage,
          { provide: IDENTITY_STORAGE, useValue: reopenedIdentity },
        ],
      });
      const reopened = TestBed.inject(IndexedDbMarkingsStorage);

      const pending = await reopened.getEnviosPendientes();
      expect(pending).toEqual([
        {
          simulacroId: 'sim-1',
          answers: { '1': 'A' },
          clientSubmittedAt: '2026-06-11T12:00:00.000Z',
        },
      ]);
    });
  });
});
