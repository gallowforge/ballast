import type { LedgerData } from '../model';

/** Where the data lives. IndexedDB in browsers, memory in tests. */
export interface Persistence {
  load(): Promise<unknown>;
  save(data: LedgerData): Promise<void>;
  clear(): Promise<void>;
  /** Last resort when the page is closing with a write still in flight: synchronous, survives unload. */
  saveSync?(data: LedgerData): void;
}

const DB = 'ledger';
const STORE = 'kv';
const KEY = 'data';
const LS_KEY = 'ledger:data:v1';
const PENDING = 'ledger:pending:v1';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
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
      // A snapshot saved while the page was closing is newer than anything in IndexedDB.
      try {
        const pending = localStorage.getItem(PENDING);
        if (pending) {
          const data = JSON.parse(pending) as LedgerData;
          if (hasIDB) {
            await tx(await db(), 'readwrite', (s) => s.put(data, KEY));
            localStorage.removeItem(PENDING);
          }
          return data;
        }
      } catch {
        /* unreadable snapshot: fall back to IndexedDB */
      }
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
    saveSync(data) {
      try {
        localStorage.setItem(PENDING, JSON.stringify(data));
      } catch {
        /* storage full or blocked: nothing more can be done while closing */
      }
    },
    async clear() {
      try {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(PENDING);
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
