import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyData } from '../defaults';
import { browserPersistence, unstamp } from '../store/persist';

const named = (name: string) => ({ ...emptyData(), settings: { ...emptyData().settings, name } });

describe('saving with stamps (localStorage fallback, as in a browser without IndexedDB)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

  it('a snapshot taken while closing wins when it is newer', async () => {
    const p = browserPersistence();
    await p.save(named('A'), 1);
    p.saveSync!(named('B'), 2);
    expect(((await p.load()) as ReturnType<typeof named>).settings.name).toBe('B');
    // Picked up once, then gone: the next load reads the saved copy.
    expect(((await p.load()) as ReturnType<typeof named>).settings.name).toBe('B');
  });

  it('an older snapshot never overwrites a newer save', async () => {
    const p = browserPersistence();
    p.saveSync!(named('A'), 1); // the tab hid mid-write
    await p.save(named('B'), 2); // came back, edited more, saved
    expect(((await p.load()) as ReturnType<typeof named>).settings.name).toBe('B');
  });

  it('a save of an older change does not drop a newer snapshot', async () => {
    const p = browserPersistence();
    p.saveSync!(named('C'), 5);
    await p.save(named('A'), 3);
    expect(((await p.load()) as ReturnType<typeof named>).settings.name).toBe('C');
  });

  it('reads data saved before stamps existed', () => {
    expect(unstamp({ settings: {} })).toEqual({ at: 0, data: { settings: {} } });
    expect(unstamp({ at: 4, data: 1 })).toEqual({ at: 4, data: 1 });
    expect(unstamp(undefined)).toBeNull();
  });
});
