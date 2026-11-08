/** Starts the store in the browser and handles the URL switches (?demo=1, ?add=1). */
import { today } from './dates';
import { buildDemo } from './demo';
import { browserPersistence } from './store/persist';
import { apply, flushSync, getState, start } from './store/store';
import { replaceAll } from './store/ops';

let booted: Promise<void> | null = null;

export function boot(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!booted) {
    addEventListener('pagehide', flushSync);
    document.addEventListener(
      'visibilitychange',
      () => document.visibilityState === 'hidden' && flushSync(),
    );
  }
  booted ??= start(browserPersistence()).then(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('demo') === '1') {
      const d = getState();
      if (!d.txns.length || d.settings.demo) apply(replaceAll(buildDemo(today())));
      params.delete('demo');
      const q = params.toString();
      history.replaceState(
        history.state,
        '',
        location.pathname + (q ? `?${q}` : '') + location.hash,
      );
    }
    if (getState().txns.length) void protect();
  });
  return booted;
}

/** Asks the browser to keep this site's data even when storage runs low. */
export async function protect(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function loadDemo(): void {
  apply(replaceAll(buildDemo(today())), 'Load demo data');
}
