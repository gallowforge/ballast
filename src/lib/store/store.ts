import { today as todayISO } from '../dates';
import { emptyData } from '../defaults';
import type { LedgerData } from '../model';
import { sanitize } from '../backup';
import { catchUp, type Op } from './ops';
import type { Persistence } from './persist';

type Listener = () => void;

let state: LedgerData = emptyData();
let ready = false;
let persistence: Persistence | null = null;
let starting: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;
let saving: Promise<void> = Promise.resolve();
const listeners = new Set<Listener>();
const history: { data: LedgerData; label: string }[] = [];

function notify() {
  for (const l of listeners) l();
}

export function getState(): LedgerData {
  return state;
}

export function isReady(): boolean {
  return ready;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  const snapshot = state;
  saving = saving
    .then(() => persistence?.save(snapshot))
    .then(() => channel?.postMessage({ type: 'saved' }))
    .catch((err) => console.error('Ledger could not save', err));
  return saving;
}

/** Loads saved data once, posts anything that fell due, and starts listening to other tabs. */
export function start(p: Persistence, now: () => string = () => todayISO()): Promise<void> {
  if (starting) return starting;
  persistence = p;
  starting = (async () => {
    const raw = await p.load();
    state = raw ? sanitize(raw).data : emptyData();
    const caught = catchUp(state, now());
    if (caught.posted) {
      state = caught.data;
      await persist();
    }
    ready = true;
    notify();
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('ledger');
      channel.onmessage = async () => {
        const fresh = await p.load();
        state = fresh ? sanitize(fresh).data : emptyData();
        notify();
      };
    }
  })();
  return starting;
}

/** Applies a change, saves it, and (with a label) remembers the old version for undo. */
export function apply(op: Op, label?: string): LedgerData {
  const before = state;
  state = op(state);
  if (state === before) return state;
  if (label) {
    history.push({ data: before, label });
    if (history.length > 20) history.shift();
  }
  notify();
  void persist();
  return state;
}

export function canUndo(): string | null {
  return history[history.length - 1]?.label ?? null;
}

export function undo(): boolean {
  const last = history.pop();
  if (!last) return false;
  state = last.data;
  notify();
  void persist();
  return true;
}

/** Waits for pending writes (used before navigating away and in tests). */
export function flush(): Promise<void> {
  return saving;
}

/** Deletes everything on this device. */
export async function wipe(): Promise<void> {
  history.length = 0;
  state = emptyData();
  await saving;
  await persistence?.clear();
  channel?.postMessage({ type: 'saved' });
  notify();
}

/** Resets module state between tests. */
export function __reset(): void {
  state = emptyData();
  ready = false;
  persistence = null;
  starting = null;
  channel?.close();
  channel = null;
  history.length = 0;
  listeners.clear();
  saving = Promise.resolve();
}
