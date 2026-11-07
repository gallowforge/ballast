import { isISODate, today } from './dates';
import { DEFAULT_CATEGORIES, emptyData } from './defaults';
import { isCurrency } from './money/currency';
import { formatMinor } from './money/money';
import { currency } from './money/currency';
import { isRate } from './money/fx';
import { toCSV } from './import/csv';
import { SCHEMA_VERSION, type AccountRole, type LedgerData, type Txn } from './model';

export const BACKUP_APP = 'ledger';

export interface Backup {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  data: LedgerData;
}

export function backupJSON(data: LedgerData, now = new Date()): string {
  const b: Backup = { app: BACKUP_APP, format: SCHEMA_VERSION, exportedAt: now.toISOString(), data };
  return JSON.stringify(b, null, 1);
}

export function backupFileName(date = today()): string {
  return `ledger-backup-${date}.json`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const int = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

export interface Sanitized {
  data: LedgerData;
  /** Records that were dropped because they were damaged. */
  dropped: number;
}

/**
 * Accepts saved or imported data from any older version, keeps every record that is sound and
 * drops (and counts) anything damaged, so a bad row never blocks opening the app.
 */
export function sanitize(raw: unknown): Sanitized {
  const base = emptyData();
  if (!isObj(raw)) return { data: base, dropped: 0 };
  let dropped = 0;
  const list = <T>(v: unknown, keep: (x: Record<string, unknown>) => T | null): T[] => {
    if (!Array.isArray(v)) return [];
    const out: T[] = [];
    for (const x of v) {
      const y = isObj(x) ? keep(x) : null;
      if (y) out.push(y);
      else dropped++;
    }
    return out;
  };

  const s = isObj(raw.settings) ? raw.settings : {};
  const settings = {
    base: isCurrency(str(s.base)) ? str(s.base) : 'KWD',
    cycleDay: int(s.cycleDay) && s.cycleDay >= 1 && s.cycleDay <= 28 ? s.cycleDay : 1,
    name: str(s.name).slice(0, 40),
    onboarded: s.onboarded === true,
    demo: s.demo === true,
  };

  const accounts = list(raw.accounts, (a) =>
    typeof a.id === 'string' && typeof a.name === 'string'
      ? {
          id: a.id,
          name: a.name.slice(0, 60),
          role: (['spending', 'savings', 'other'] as const).includes(a.role as never) ? (a.role as AccountRole) : ('other' as AccountRole),
          currency: isCurrency(str(a.currency)) ? str(a.currency) : settings.base,
          opening: int(a.opening) ? a.opening : 0,
          openedOn: isISODate(a.openedOn) ? a.openedOn : today(),
          ...(a.archived === true ? { archived: true } : {}),
        }
      : null,
  );
  const accountIds = new Set(accounts.map((a) => a.id));

  const categories = Array.isArray(raw.categories)
    ? list(raw.categories, (c) =>
        typeof c.id === 'string' && typeof c.name === 'string' && (c.kind === 'expense' || c.kind === 'income')
          ? {
              id: c.id,
              name: c.name.slice(0, 40),
              kind: c.kind as 'expense' | 'income',
              hue: typeof c.hue === 'number' ? c.hue : 80,
              icon: str(c.icon, 'dots'),
              ...(c.archived === true ? { archived: true } : {}),
            }
          : null,
      )
    : DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  const categoryIds = new Set(categories.map((c) => c.id));

  const txns = list<Txn>(raw.txns, (t) => {
    const kind = t.kind;
    if (typeof t.id !== 'string' || !isISODate(t.date) || !int(t.amount) || t.amount < 0) return null;
    if (kind !== 'expense' && kind !== 'income' && kind !== 'transfer') return null;
    if (typeof t.accountId !== 'string' || !accountIds.has(t.accountId)) return null;
    if (kind === 'transfer' && (typeof t.toAccountId !== 'string' || !accountIds.has(t.toAccountId))) return null;
    const out: Txn = {
      id: t.id,
      date: t.date,
      kind,
      accountId: t.accountId,
      amount: t.amount,
      base: int(t.base) ? t.base : t.amount,
      payee: str(t.payee).slice(0, 120),
      source: (['manual', 'import', 'recurring', 'salary', 'demo'] as const).includes(t.source as never)
        ? (t.source as Txn['source'])
        : 'manual',
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : 0,
    };
    if (typeof t.categoryId === 'string' && categoryIds.has(t.categoryId) && kind !== 'transfer') out.categoryId = t.categoryId;
    if (typeof t.note === 'string' && t.note) out.note = t.note.slice(0, 500);
    if (kind === 'transfer') {
      out.toAccountId = t.toAccountId as string;
      out.toAmount = int(t.toAmount) ? t.toAmount : t.amount;
    }
    if (isObj(t.original) && int(t.original.amount) && isCurrency(str(t.original.currency)))
      out.original = { amount: t.original.amount, currency: str(t.original.currency) };
    for (const k of ['recurringId', 'importId', 'fingerprint'] as const) if (typeof t[k] === 'string') out[k] = t[k] as string;
    return out;
  });

  const recurring = list(raw.recurring, (r) =>
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    (r.kind === 'expense' || r.kind === 'income') &&
    int(r.amount) &&
    r.amount > 0 &&
    typeof r.accountId === 'string' &&
    accountIds.has(r.accountId) &&
    isISODate(r.startOn) &&
    (r.unit === 'week' || r.unit === 'month' || r.unit === 'year')
      ? {
          id: r.id,
          name: r.name.slice(0, 60),
          kind: r.kind as 'expense' | 'income',
          amount: r.amount,
          accountId: r.accountId,
          ...(typeof r.categoryId === 'string' && categoryIds.has(r.categoryId) ? { categoryId: r.categoryId } : {}),
          every: int(r.every) && r.every >= 1 ? r.every : 1,
          unit: r.unit as 'week' | 'month' | 'year',
          startOn: r.startOn,
          ...(isISODate(r.endOn) ? { endOn: r.endOn } : {}),
          autoPost: r.autoPost === true,
          ...(isISODate(r.lastPostedOn) ? { lastPostedOn: r.lastPostedOn } : {}),
        }
      : null,
  );

  const budgets = list(raw.budgets, (b) =>
    typeof b.categoryId === 'string' && categoryIds.has(b.categoryId) && int(b.amount) && b.amount >= 0
      ? { categoryId: b.categoryId, amount: b.amount, rollover: b.rollover === true, since: isISODate(b.since) ? b.since : today() }
      : null,
  );

  let salary = null;
  if (isObj(raw.salary)) {
    const x = raw.salary;
    if (int(x.amount) && accountIds.has(str(x.fromAccountId)) && accountIds.has(str(x.toAccountId)) && isISODate(x.startedOn))
      salary = {
        active: x.active !== false,
        amount: x.amount,
        fromAccountId: str(x.fromAccountId),
        toAccountId: str(x.toAccountId),
        autoPost: x.autoPost !== false,
        startedOn: x.startedOn,
        ...(isISODate(x.lastPostedOn) ? { lastPostedOn: x.lastPostedOn } : {}),
      };
    else dropped++;
  }

  let target = null;
  if (isObj(raw.target)) {
    const x = raw.target;
    if (isISODate(x.date)) target = { date: x.date, floor: int(x.floor) ? x.floor : 0, label: str(x.label, 'Target').slice(0, 40) };
    else dropped++;
  }

  const rules = list(raw.rules, (r) =>
    typeof r.id === 'string' && typeof r.match === 'string' && typeof r.categoryId === 'string' && categoryIds.has(r.categoryId)
      ? { id: r.id, match: r.match, categoryId: r.categoryId, ...(typeof r.payee === 'string' ? { payee: r.payee } : {}), createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0 }
      : null,
  );

  const imports = list(raw.imports, (b) =>
    typeof b.id === 'string' && accountIds.has(str(b.accountId)) && isISODate(b.from) && isISODate(b.to)
      ? {
          id: b.id,
          at: typeof b.at === 'number' ? b.at : 0,
          kind: b.kind === 'pdf' ? ('pdf' as const) : ('csv' as const),
          profile: str(b.profile, 'generic'),
          fileName: str(b.fileName, 'statement'),
          accountId: str(b.accountId),
          count: int(b.count) ? b.count : 0,
          skipped: int(b.skipped) ? b.skipped : 0,
          from: b.from,
          to: b.to,
          ...(int(b.closing) ? { closing: b.closing } : {}),
        }
      : null,
  );

  const rates: LedgerData['rates'] = {};
  if (isObj(raw.rates))
    for (const [code, r] of Object.entries(raw.rates)) {
      if (isCurrency(code) && isObj(r) && isRate(str(r.rate)) && isISODate(r.on)) rates[code] = { rate: str(r.rate), on: r.on };
      else dropped++;
    }

  const dismissed = Array.isArray(raw.dismissed) ? raw.dismissed.filter((x): x is string => typeof x === 'string').slice(-200) : [];

  return {
    data: { version: SCHEMA_VERSION, settings, accounts, categories, txns, recurring, budgets, salary, target, rules, imports, rates, dismissed },
    dropped,
  };
}

export type BackupResult =
  | { ok: true; data: LedgerData; dropped: number; exportedAt?: string }
  | { ok: false; error: string };

/** Reads a backup file. Refuses anything that is not a Ledger backup, or from a newer version. */
export function parseBackup(text: string): BackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON, so it cannot be a Ledger backup.' };
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP || !isObj(raw.data))
    return { ok: false, error: 'This file is not a Ledger backup.' };
  if (typeof raw.format === 'number' && raw.format > SCHEMA_VERSION)
    return { ok: false, error: 'This backup comes from a newer version of Ledger. Update the app, then try again.' };
  const { data, dropped } = sanitize(raw.data);
  return { ok: true, data, dropped, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined };
}

/** Adds everything from `incoming` that is not already here (matched by id). */
export function mergeData(current: LedgerData, incoming: LedgerData): LedgerData {
  const union = <T>(a: T[], b: T[], key: (x: T) => string) => {
    const seen = new Set(a.map(key));
    return [...a, ...b.filter((x) => !seen.has(key(x)))];
  };
  const fp = new Set(current.txns.map((t) => t.fingerprint).filter(Boolean));
  return {
    ...current,
    accounts: union(current.accounts, incoming.accounts, (a) => a.id),
    categories: union(current.categories, incoming.categories, (c) => c.id),
    txns: union(current.txns, incoming.txns.filter((t) => !t.fingerprint || !fp.has(t.fingerprint)), (t) => t.id),
    recurring: union(current.recurring, incoming.recurring, (r) => r.id),
    budgets: union(current.budgets, incoming.budgets, (b) => b.categoryId),
    rules: union(current.rules, incoming.rules, (r) => r.match),
    imports: union(current.imports, incoming.imports, (b) => b.id),
    rates: { ...incoming.rates, ...current.rates },
    salary: current.salary ?? incoming.salary,
    target: current.target ?? incoming.target,
  };
}

/** Every transaction as CSV, for spreadsheets. */
export function transactionsCSV(data: LedgerData): string {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const baseExp = currency(data.settings.base).exp;
  const rows: (string | number)[][] = [
    ['Date', 'Type', 'Account', 'To account', 'Payee', 'Category', 'Amount', 'Currency', `Amount (${data.settings.base})`, 'Note'],
  ];
  for (const t of [...data.txns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))) {
    const acct = accounts.get(t.accountId);
    const cur = acct?.currency ?? data.settings.base;
    const sign = t.kind === 'expense' ? -1 : 1;
    rows.push([
      t.date,
      t.kind,
      acct?.name ?? '',
      t.toAccountId ? (accounts.get(t.toAccountId)?.name ?? '') : '',
      t.payee,
      t.categoryId ? (cats.get(t.categoryId) ?? '') : '',
      formatMinor(sign * t.amount, currency(cur).exp, { group: false }).replace('−', '-'),
      cur,
      formatMinor(sign * t.base, baseExp, { group: false }).replace('−', '-'),
      t.note ?? '',
    ]);
  }
  return toCSV(rows);
}
