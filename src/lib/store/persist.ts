import type { LedgerData } from '../model';

/**
 * Where the data lives: IndexedDB in browsers (localStorage where IndexedDB is blocked), memory in
 * tests. Every write carries a stamp (`at`, increasing) taken when the change was made, so the
 * newest copy always wins, however the writes interleave.
 */
export interface Persistence {
  load(): Promise<unknown>;
  save(data: LedgerData, at: number): Promise<void>;
  clear(): Promise<void>;
  /** Last resort when the page hides with a write still in flight: synchronous, survives unload. */
  saveSync?(data: LedgerData, at: number): void;
}

interface Stamped {
  at: number;
  data: unknown;
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

/** Reads a stored record; plain data from before stamps existed counts as the oldest. */
export function unstamp(raw: unknown): Stamped | null {
  if (raw === undefined || raw === null) return null;
  if (
    typeof raw === 'object' &&
    'at' in raw &&
    'data' in raw &&
    typeof (raw as Stamped).at === 'number'
  )
    return raw as Stamped;
  return { at: 0, data: raw };
}

function readLS(key: string): Stamped | null {
  try {
    const s = localStorage.getItem(key);
    return s ? unstamp(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

function dropPendingUpTo(at: number) {
  try {
    const p = readLS(PENDING);
    if (p && p.at <= at) localStorage.removeItem(PENDING);
  } catch {
    /* ignore */
  }
}

export function browserPersistence(): Persistence {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= open());
  const hasIDB = typeof indexedDB !== 'undefined';

  const readMain = async (): Promise<Stamped | null> => {
    if (hasIDB) {
      try {
        return unstamp(await tx(await db(), 'readonly', (s) => s.get(KEY)));
      } catch {
        /* fall through to localStorage */
      }
    }
    return readLS(LS_KEY);
  };
  const writeMain = async (rec: Stamped) => {
    if (hasIDB) {
      try {
        await tx(await db(), 'readwrite', (s) => s.put(rec, KEY));
        return;
      } catch {
        /* fall through */
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(rec));
  };

  return {
    async load() {
      const main = await readMain();
      const pending = readLS(PENDING);
      // A snapshot taken while the page was closing wins only when it is newer than what was saved.
      if (pending && (!main || pending.at > main.at)) {
        try {
          await writeMain(pending);
        } catch {
          /* keep the pending copy for next time */
          return pending.data;
        }
      }
      try {
        localStorage.removeItem(PENDING);
      } catch {
        /* ignore */
      }
      return pending && (!main || pending.at > main.at) ? pending.data : main?.data;
    },
    async save(data, at) {
      await writeMain({ at, data });
      dropPendingUpTo(at);
    },
    saveSync(data, at) {
      try {
        localStorage.setItem(PENDING, JSON.stringify({ at, data }));
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
