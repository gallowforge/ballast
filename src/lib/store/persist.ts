import type { LedgerData } from '../model';

/** Where the data lives. IndexedDB in browsers, memory in tests. */
export interface Persistence {
  load(): Promise<unknown>;
  save(data: LedgerData): Promise<void>;
  clear(): Promise<void>;
}

const DB = 'ledger';
const STORE = 'kv';
const KEY = 'data';
const LS_KEY = 'ledger:data:v1';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** IndexedDB, with localStorage as the fallback where IndexedDB is blocked. */
export function browserPersistence(): Persistence {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= open());
  const hasIDB = typeof indexedDB !== 'undefined';
  return {
    async load() {
      if (hasIDB) {
        try {
          return await tx(await db(), 'readonly', (s) => s.get(KEY));
        } catch {
          /* fall through */
        }
      }
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    },
    async save(data) {
      if (hasIDB) {
        try {
          await tx(await db(), 'readwrite', (s) => s.put(data, KEY));
          return;
        } catch {
          /* fall through */
        }
      }
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    },
    async clear() {
      try {
        localStorage.removeItem(LS_KEY);
      } catch {
        /* ignore */
      }
      if (!hasIDB) return;
      try {
        await tx(await db(), 'readwrite', (s) => s.delete(KEY));
      } catch {
        /* ignore */
      }
    },
  };
}

export function memoryPersistence(initial?: unknown): Persistence {
  let value: unknown = initial;
  return {
    async load() {
      return value === undefined ? undefined : structuredClone(value);
    },
    async save(data) {
      value = structuredClone(data);
    },
    async clear() {
      value = undefined;
    },
  };
}
