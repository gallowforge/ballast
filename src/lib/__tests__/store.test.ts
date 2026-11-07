import { beforeEach, describe, expect, it } from 'vitest';
import { backupJSON, backupFileName, mergeData, parseBackup, sanitize, transactionsCSV } from '../backup';
import { emptyData } from '../defaults';
import { parseCSV } from '../import/csv';
import { addTxn, setSettings } from '../store/ops';
import { memoryPersistence } from '../store/persist';
import * as store from '../store/store';
import { data, savings, spending, txn, wallet } from './fixtures';

beforeEach(() => store.__reset());

describe('the store', () => {
  it('starts empty, then loads what was saved', async () => {
    const saved = data({ accounts: [spending], settings: { ...emptyData().settings, name: 'Sam' } });
    await store.start(memoryPersistence(saved), () => '2026-11-08');
    expect(store.isReady()).toBe(true);
    expect(store.getState().settings.name).toBe('Sam');
  });

  it('posts what fell due while it was closed, and saves that', async () => {
    const p = memoryPersistence(
      data({ accounts: [savings, spending], salary: { active: true, amount: 100_000, fromAccountId: 'sav', toAccountId: 'cur', autoPost: true, startedOn: '2026-11-01' } }),
    );
    await store.start(p, () => '2026-11-08');
    expect(store.getState().txns).toHaveLength(1);
    expect(((await p.load()) as { txns: unknown[] }).txns).toHaveLength(1);
  });

  it('applies changes, notifies, saves, and undoes', async () => {
    const p = memoryPersistence();
    await store.start(p, () => '2026-11-08');
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.apply(setSettings({ name: 'Alex' }), 'Rename');
    await store.flush();
    expect(calls).toBe(1);
    expect(((await p.load()) as { settings: { name: string } }).settings.name).toBe('Alex');
    expect(store.canUndo()).toBe('Rename');
    expect(store.undo()).toBe(true);
    expect(store.getState().settings.name).toBe('');
    expect(store.undo()).toBe(false);
    off();
  });

  it('ignores changes that change nothing', async () => {
    await store.start(memoryPersistence(), () => '2026-11-08');
    const before = store.getState();
    expect(store.apply((d) => d, 'Nothing')).toBe(before);
    expect(store.canUndo()).toBeNull();
  });

  it('keeps at most twenty undo steps', async () => {
    await store.start(memoryPersistence(), () => '2026-11-08');
    for (let i = 0; i < 25; i++) store.apply(setSettings({ name: `n${i}` }), `step ${i}`);
    let n = 0;
    while (store.undo()) n++;
    expect(n).toBe(20);
  });

  it('wipes everything', async () => {
    const p = memoryPersistence(data({ accounts: [spending] }));
    await store.start(p, () => '2026-11-08');
    await store.wipe();
    expect(store.getState().accounts).toHaveLength(0);
    expect(await p.load()).toBeUndefined();
  });

  it('starts only once', async () => {
    const p = memoryPersistence();
    const a = store.start(p, () => '2026-11-08');
    const b = store.start(p, () => '2026-11-08');
    expect(a).toBe(b);
    await a;
  });
});

describe('backups', () => {
  const full = () =>
    addTxn({ date: '2026-11-02', kind: 'expense', accountId: 'cur', amount: 4_250, payee: 'Talabat', categoryId: 'delivery', source: 'manual', note: 'lunch, "big"' })(
      data({ accounts: [savings, spending, wallet], rates: { USD: { rate: '0.3', on: '2026-11-01' } }, target: { date: '2028-06-01', floor: 500_000, label: 'Graduation' } }),
    );

  it('round-trips through a backup file', () => {
    const d = full();
    const back = parseBackup(backupJSON(d));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.data).toEqual(d);
      expect(back.dropped).toBe(0);
      expect(back.exportedAt).toMatch(/^\d{4}-/);
    }
  });

  it('names the file with the date', () => expect(backupFileName('2026-11-08')).toBe('ledger-backup-2026-11-08.json'));

  it.each([
    ['not json', 'not valid JSON'],
    ['{"hello":1}', 'not a Ledger backup'],
    ['{"app":"ledger","format":99,"data":{}}', 'newer version'],
  ])('refuses %j', (text, msg) => {
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it('drops damaged records and counts them instead of failing', () => {
    const d = full();
    const raw = JSON.parse(JSON.stringify(d));
    raw.txns.push({ id: 'bad', date: '2026-02-31', amount: 5, kind: 'expense', accountId: 'cur' });
    raw.txns.push({ id: 'float', date: '2026-11-01', amount: 1.5, kind: 'expense', accountId: 'cur' });
    raw.txns.push({ id: 'orphan', date: '2026-11-01', amount: 1, kind: 'expense', accountId: 'nope' });
    raw.accounts.push('junk');
    raw.rates.XYZ = { rate: '1', on: '2026-11-01' };
    raw.salary = { amount: 1 };
    const s = sanitize(raw);
    expect(s.data.txns).toHaveLength(1);
    expect(s.dropped).toBe(6);
  });

  it('repairs missing pieces with sensible defaults', () => {
    const s = sanitize({ settings: { base: 'NOPE', cycleDay: 40 }, txns: 'x' });
    expect(s.data.settings).toMatchObject({ base: 'KWD', cycleDay: 1, onboarded: false });
    expect(s.data.categories.length).toBeGreaterThan(10);
    expect(sanitize(null).data).toEqual(emptyData());
  });

  it('merges a backup into existing data without duplicating', () => {
    const d = full();
    const other = addTxn({ date: '2026-11-05', kind: 'expense', accountId: 'cur', amount: 1, payee: 'New', source: 'manual' })(d);
    const merged = mergeData(d, other);
    expect(merged.txns).toHaveLength(2);
    expect(mergeData(merged, other).txns).toHaveLength(2);
    expect(mergeData(emptyData(), d).target).toEqual(d.target);
  });

  it('skips imported lines already present under another id', () => {
    const d = { ...full(), txns: [txn({ id: 'a', date: '2026-11-01', amount: 1, fingerprint: 'fp#1' })] };
    const incoming = { ...full(), txns: [txn({ id: 'b', date: '2026-11-01', amount: 1, fingerprint: 'fp#1' })] };
    expect(mergeData(d, incoming).txns.map((t) => t.id)).toEqual(['a']);
  });

  it('exports transactions as a spreadsheet-friendly CSV', () => {
    const rows = parseCSV(transactionsCSV(full()));
    expect(rows[0]).toEqual(['Date', 'Type', 'Account', 'To account', 'Payee', 'Category', 'Amount', 'Currency', 'Amount (KWD)', 'Note']);
    expect(rows[1]).toEqual(['2026-11-02', 'expense', 'Current', '', 'Talabat', 'Food delivery', '-4.250', 'KWD', '-4.250', 'lunch, "big"']);
  });
});
