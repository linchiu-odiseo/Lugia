import { Injectable, inject } from '@angular/core';
import {
  AnswersMap,
  AlternativaValue,
  EnvioPendiente,
  MarkingsStorage,
} from '../../L1_domain/ports/markings-storage';
import { OfflineStorageUnavailableError } from '../../L1_domain/errors/offline-storage-unavailable.error';
import { LocalStorageSessionStorage } from './local-storage-session-storage';

const DB_NAME = 'lugia-cartilla';
const DB_VERSION = 1;
const STORE = 'data';

// Patrón de keys planas en un único object store. La key encapsula el
// scope por usuario (`userEmail`) y la entidad (marcacion vs queue).
//   marcacion: cartilla.<email>.simulacro.<simulacroId>.<pregunta>
//   queue:     cartilla.<email>.queue.<simulacroId>
// El prefijo `cartilla.<email>.` permite que `wipeUserScope()` use un
// rango de IDBKeyRange.bound(...) sin tocar datos de otros usuarios.
const KEY_ROOT = 'cartilla';

@Injectable({ providedIn: 'root' })
export class IndexedDbMarkingsStorage implements MarkingsStorage {
  private readonly sessionStorage = inject(LocalStorageSessionStorage);
  private dbPromise: Promise<IDBDatabase> | null = null;

  async setMarcacion(
    simulacroId: string,
    pregunta: number,
    alternativa: AlternativaValue,
  ): Promise<void> {
    const email = await this.requireUserEmail();
    const db = await this.db();
    await this.put(db, marcacionKey(email, simulacroId, pregunta), { alternativa });
  }

  async getMarcaciones(simulacroId: string): Promise<AnswersMap> {
    const email = await this.requireUserEmail();
    const db = await this.db();
    const prefix = `${KEY_ROOT}.${email}.simulacro.${simulacroId}.`;
    const entries = await this.getRange(db, prefix);
    const out: AnswersMap = {};
    for (const { key, value } of entries) {
      const pregunta = key.slice(prefix.length);
      out[pregunta] = (value as { alternativa: AlternativaValue }).alternativa;
    }
    return out;
  }

  async clearMarcaciones(simulacroId: string): Promise<void> {
    const email = await this.requireUserEmail();
    const db = await this.db();
    const prefix = `${KEY_ROOT}.${email}.simulacro.${simulacroId}.`;
    await this.deleteRange(db, prefix);
  }

  async enqueueEnvio(envio: EnvioPendiente): Promise<void> {
    const email = await this.requireUserEmail();
    const db = await this.db();
    await this.put(db, queueKey(email, envio.simulacroId), envio);
  }

  async getEnviosPendientes(): Promise<EnvioPendiente[]> {
    const email = await this.requireUserEmail();
    const db = await this.db();
    const prefix = `${KEY_ROOT}.${email}.queue.`;
    const entries = await this.getRange(db, prefix);
    return entries.map(({ value }) => value as EnvioPendiente);
  }

  async dequeueEnvio(simulacroId: string): Promise<void> {
    const email = await this.requireUserEmail();
    const db = await this.db();
    await this.delete(db, queueKey(email, simulacroId));
  }

  async wipeUserScope(): Promise<void> {
    const email = await this.requireUserEmail();
    const db = await this.db();
    const prefix = `${KEY_ROOT}.${email}.`;
    await this.deleteRange(db, prefix);
  }

  // --- helpers privados ---

  private async db(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') {
      throw new OfflineStorageUnavailableError('IndexedDB no está disponible en este navegador.');
    }
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(
          new OfflineStorageUnavailableError(
            `No se pudo abrir IndexedDB: ${req.error?.message ?? 'error desconocido'}.`,
          ),
        );
    });
    // No cachear el rechazo: si falla, el próximo intento reabre.
    this.dbPromise.catch(() => {
      this.dbPromise = null;
    });
    return this.dbPromise;
  }

  private async requireUserEmail(): Promise<string> {
    const session = await this.sessionStorage.read();
    if (!session) {
      throw new OfflineStorageUnavailableError(
        'No hay sesión activa para resolver el scope del storage.',
      );
    }
    return session.userEmail;
  }

  private put(db: IDBDatabase, key: string, value: unknown): Promise<void> {
    return runTx(db, 'readwrite', (store) => store.put(value, key));
  }

  private delete(db: IDBDatabase, key: string): Promise<void> {
    return runTx(db, 'readwrite', (store) => store.delete(key));
  }

  private async getRange(
    db: IDBDatabase,
    prefix: string,
  ): Promise<{ key: string; value: unknown }[]> {
    const range = prefixRange(prefix);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.openCursor(range);
      const out: { key: string; value: unknown }[] = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        out.push({ key: String(cursor.key), value: cursor.value });
        cursor.continue();
      };
      req.onerror = () =>
        reject(
          new OfflineStorageUnavailableError(
            `Fallo al leer rango: ${req.error?.message ?? 'error desconocido'}.`,
          ),
        );
    });
  }

  private async deleteRange(db: IDBDatabase, prefix: string): Promise<void> {
    const range = prefixRange(prefix);
    return runTx(db, 'readwrite', (store) => store.delete(range));
  }
}

// --- utilidades libres ---

function marcacionKey(email: string, simulacroId: string, pregunta: number): string {
  return `${KEY_ROOT}.${email}.simulacro.${simulacroId}.${pregunta}`;
}

function queueKey(email: string, simulacroId: string): string {
  return `${KEY_ROOT}.${email}.queue.${simulacroId}`;
}

// Rango "key starts with prefix" — IndexedDB ordena keys lexicográficamente,
// así que el sufijo '￿' cubre todas las claves que empiezan con el prefijo.
function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + '￿');
}

function runTx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    op(store);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new OfflineStorageUnavailableError(
          `Fallo en transacción IndexedDB: ${tx.error?.message ?? 'error desconocido'}.`,
        ),
      );
    tx.onabort = () =>
      reject(
        new OfflineStorageUnavailableError(
          `Transacción IndexedDB abortada: ${tx.error?.message ?? 'error desconocido'}.`,
        ),
      );
  });
}
