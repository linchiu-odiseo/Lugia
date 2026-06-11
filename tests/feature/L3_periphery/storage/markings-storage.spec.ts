// Tests del adapter L3 `IndexedDbMarkingsStorage`.
//
// Cubrimos los escenarios listados en
// `openspec/changes/cartilla-fase-2/specs/offline-storage/spec.md`
// Requirements 1–4 (puerto, scope por userEmail, IDB no disponible,
// recuperación tras cierre).
//
// El adapter inyecta `LocalStorageSessionStorage` (clase concreta L3, no el
// puerto) para derivar el `userEmail` del scope. Usamos TestBed con un fake
// que provee la sesión actual sin tocar `localStorage` real — así los tests
// pueden cambiar de "usuario" entre escenarios sin reiniciar IndexedDB.
//
// `fake-indexeddb/auto` reemplaza `globalThis.indexedDB` al importarse.
// Para el escenario "IDB no disponible" guardamos y restauramos el global.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { IndexedDbMarkingsStorage } from '../../../../src/L3_periphery/storage/indexed-db-markings-storage';
import { LocalStorageSessionStorage } from '../../../../src/L3_periphery/storage/local-storage-session-storage';
import { OfflineStorageUnavailableError } from '../../../../src/L1_domain/errors/offline-storage-unavailable.error';
import { Session } from '../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';

const DB_NAME = 'neonpanda-cartilla';
const STORE = 'data';

// Doble de `LocalStorageSessionStorage` que devuelve la sesión actualmente
// configurada por el test. Como el adapter inyecta la CLASE concreta y no
// un token, registramos en el TestBed con `useValue` apuntando a esta
// instancia. La clase real no se construye.
class StubSessionStorage {
  private current: Session | null = null;

  setSession(s: Session | null): void {
    this.current = s;
  }

  async read(): Promise<Session | null> {
    return this.current;
  }

  // Estos métodos no se usan en este spec pero satisfacen el contrato
  // estructural por si alguna ruta del adapter cambia en el futuro.
  async write(s: Session): Promise<void> {
    this.current = s;
  }

  async clear(): Promise<void> {
    this.current = null;
  }
}

function makeSession(email: string): Session {
  return new Session(new BearerToken('6|abc'), email, new Date('2026-06-11T12:00:00Z'));
}

// Vacía el único object store entre tests para que un test no contamine
// a otro. NO usamos `indexedDB.deleteDatabase` porque eso requiere cerrar
// todas las conexiones abiertas (el adapter cachea una `dbPromise` y no
// expone close), lo que dispara `onblocked` indefinidamente bajo
// fake-indexeddb. Limpiar las keys del store es equivalente para nuestro
// propósito (aislar tests).
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
  let session: StubSessionStorage;
  let adapter: IndexedDbMarkingsStorage;

  beforeEach(async () => {
    await wipeAllKeys();
    session = new StubSessionStorage();
    session.setSession(makeSession('a@panda.test'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        IndexedDbMarkingsStorage,
        { provide: LocalStorageSessionStorage, useValue: session },
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
      // La spec dice explícitamente "valor `null`" en el shape. Verificamos
      // que el roundtrip preserva null (no lo borra ni lo convierte a undefined).
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

  describe('scope por userEmail', () => {
    it('usuario B no ve marcaciones del usuario A', async () => {
      session.setSession(makeSession('a@panda.test'));
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-1', 2, 'B');

      session.setSession(makeSession('b@panda.test'));
      const mapB = await adapter.getMarcaciones('sim-1');
      expect(mapB).toEqual({});

      // Y al volver a A, sigue todo donde estaba.
      session.setSession(makeSession('a@panda.test'));
      const mapA = await adapter.getMarcaciones('sim-1');
      expect(mapA).toEqual({ '1': 'A', '2': 'B' });
    });

    it('wipeUserScope de B no afecta los datos de A', async () => {
      session.setSession(makeSession('a@panda.test'));
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.enqueueEnvio({
        simulacroId: 'sim-1',
        answers: { '1': 'A' },
        clientSubmittedAt: '2026-06-11T12:00:00.000Z',
      });

      session.setSession(makeSession('b@panda.test'));
      await adapter.setMarcacion('sim-9', 1, 'D');
      await adapter.wipeUserScope();

      // B quedó vacío.
      expect(await adapter.getMarcaciones('sim-9')).toEqual({});
      expect(await adapter.getEnviosPendientes()).toEqual([]);

      // A intacto.
      session.setSession(makeSession('a@panda.test'));
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
      // Por contrato: la key es `cartilla.<email>.queue.<simulacroId>`,
      // así que dos enqueue del mismo simulacro NO se duplican en la cola.
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
    // fake-indexeddb/auto setea `indexedDB` al importarse. Para simular un
    // browser que no expone IDB, guardamos el global, lo desconectamos, y
    // construimos un adapter NUEVO (el de beforeEach ya tiene una db abierta).
    // Restauramos en finally para no contaminar otros tests.

    it('rechaza con OfflineStorageUnavailableError si indexedDB es undefined', async () => {
      const g = globalThis as unknown as { indexedDB?: IDBFactory };
      const saved = g.indexedDB;
      g.indexedDB = undefined;
      try {
        // Reconstruir el adapter SIN db cacheada — el TestBed actual ya
        // resolvió uno; necesitamos uno fresco que detecte el global ausente.
        TestBed.resetTestingModule();
        const freshSession = new StubSessionStorage();
        freshSession.setSession(makeSession('a@panda.test'));
        TestBed.configureTestingModule({
          providers: [
            IndexedDbMarkingsStorage,
            { provide: LocalStorageSessionStorage, useValue: freshSession },
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

  describe('sin sesión activa', () => {
    it('rechaza con OfflineStorageUnavailableError si no hay sesión para derivar el scope', async () => {
      session.setSession(null);
      await expect(adapter.setMarcacion('sim-1', 1, 'A')).rejects.toBeInstanceOf(
        OfflineStorageUnavailableError,
      );
    });
  });

  describe('recuperación tras cierre de app', () => {
    it('marcaciones persisten al reabrir el adapter (mismo DB)', async () => {
      // Simula "cerrar la app": el TestBed se resetea y se construye un
      // adapter NUEVO contra la misma instancia de IndexedDB.
      await adapter.setMarcacion('sim-1', 1, 'A');
      await adapter.setMarcacion('sim-1', 2, 'B');

      TestBed.resetTestingModule();
      const reopenedSession = new StubSessionStorage();
      reopenedSession.setSession(makeSession('a@panda.test'));
      TestBed.configureTestingModule({
        providers: [
          IndexedDbMarkingsStorage,
          { provide: LocalStorageSessionStorage, useValue: reopenedSession },
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
      const reopenedSession = new StubSessionStorage();
      reopenedSession.setSession(makeSession('a@panda.test'));
      TestBed.configureTestingModule({
        providers: [
          IndexedDbMarkingsStorage,
          { provide: LocalStorageSessionStorage, useValue: reopenedSession },
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
