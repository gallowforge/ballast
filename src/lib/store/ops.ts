/**
 * Every change to the data is a pure function: old data in, new data out. The store applies them,
 * saves the result and keeps the previous version for undo.
 */
import { cycleOf, type ISODate } from '../dates';
import { convert } from '../money/fx';
import type { Minor } from '../money/money';
import { uid } from '../ids';
import { rateFor, toBase } from '../ledger';
import type {
  Account,
  Budget,
  Category,
  LedgerData,
  Recurring,
  Rule,
  Salary,
  Settings,
  Target,
  Txn,
} from '../model';
import { salaryDue } from '../calc/cycle';
import { duePosts } from '../calc/recurring';
import { ruleKey } from '../import/categorize';
import { merchantKey } from '../import/clean';
import type { ReviewRow } from '../import/importer';

export type Op = (data: LedgerData) => LedgerData;

export type TxnInput = Omit<Txn, 'id' | 'createdAt' | 'base'> & {
  base?: Minor;
  id?: string;
  createdAt?: number;
};

function accountCurrency(data: LedgerData, id: string): string {
  return data.accounts.find((a) => a.id === id)?.currency ?? data.settings.base;
}

/** Fills in the base-currency value (and a transfer's received amount) from the latest rates. */
export function completeTxn(data: LedgerData, input: TxnInput): Txn {
  const cur = accountCurrency(data, input.accountId);
  const base = input.base ?? toBase(data, input.amount, cur) ?? input.amount;
  const txn: Txn = {
    ...input,
    id: input.id ?? uid('t'),
    createdAt: input.createdAt ?? Date.now(),
    base,
  };
  if (txn.kind === 'transfer' && txn.toAccountId && txn.toAmount === undefined) {
    const to = accountCurrency(data, txn.toAccountId);
    if (to === cur) txn.toAmount = txn.amount;
    else {
      const rFrom = rateFor(data, cur);
      const rTo = rateFor(data, to);
      const inBase = rFrom ? convert(txn.amount, cur, data.settings.base, rFrom) : null;
      txn.toAmount =
        inBase !== null && rTo
          ? (convert(inBase, data.settings.base, to, invertRate(rTo)) ?? txn.amount)
          : txn.amount;
    }
  }
  if (txn.kind === 'transfer') delete txn.categoryId;
  return txn;
}

/** 1 / rate as a decimal string with 8 decimals. */
export function invertRate(rate: string): string {
  const v = 1 / Number(rate);
  return Number.isFinite(v) ? v.toFixed(8) : '1';
}

export const addTxn =
  (input: TxnInput): Op =>
  (d) => ({ ...d, txns: [...d.txns, completeTxn(d, input)] });

export const addTxns =
  (inputs: TxnInput[]): Op =>
  (d) => ({ ...d, txns: [...d.txns, ...inputs.map((i) => completeTxn(d, i))] });

export const updateTxn =
  (id: string, patch: Partial<TxnInput>): Op =>
  (d) => ({
    ...d,
    txns: d.txns.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch } as TxnInput;
      const recompute =
        patch.amount !== undefined || patch.accountId !== undefined || patch.kind !== undefined;
      if (recompute && patch.base === undefined) delete next.base;
      if (recompute && patch.toAmount === undefined) delete next.toAmount;
      return completeTxn(d, { ...next, id: t.id, createdAt: t.createdAt });
    }),
  });

export const deleteTxns =
  (ids: readonly string[]): Op =>
  (d) => {
    const drop = new Set(ids);
    return { ...d, txns: d.txns.filter((t) => !drop.has(t.id)) };
  };

/** Sets the category on many transactions at once. */
export const categorizeTxns =
  (ids: readonly string[], categoryId: string): Op =>
  (d) => {
    const set = new Set(ids);
    return {
      ...d,
      txns: d.txns.map((t) => (set.has(t.id) && t.kind !== 'transfer' ? { ...t, categoryId } : t)),
    };
  };

/* ---------- Accounts ---------- */

export const addAccount =
  (a: Omit<Account, 'id'> & { id?: string }): Op =>
  (d) => ({ ...d, accounts: [...d.accounts, { ...a, id: a.id ?? uid('a') }] });

export const updateAccount =
  (id: string, patch: Partial<Account>): Op =>
  (d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...patch, id } : a)) });

/** Removes an account and everything in it, and anything that pointed at it. */
export const deleteAccount =
  (id: string): Op =>
  (d) => ({
    ...d,
    accounts: d.accounts.filter((a) => a.id !== id),
    txns: d.txns.filter((t) => t.accountId !== id && t.toAccountId !== id),
    recurring: d.recurring.filter((r) => r.accountId !== id),
    imports: d.imports.filter((b) => b.accountId !== id),
    salary:
      d.salary && (d.salary.fromAccountId === id || d.salary.toAccountId === id) ? null : d.salary,
  });

/* ---------- Categories ---------- */

export const addCategory =
  (c: Omit<Category, 'id'> & { id?: string }): Op =>
  (d) => ({ ...d, categories: [...d.categories, { ...c, id: c.id ?? uid('c') }] });

export const updateCategory =
  (id: string, patch: Partial<Category>): Op =>
  (d) => ({
    ...d,
    categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch, id } : c)),
  });

/** Deletes a category; its transactions move to `moveTo` (or become uncategorised). */
export const deleteCategory =
  (id: string, moveTo?: string): Op =>
  (d) => ({
    ...d,
    categories: d.categories.filter((c) => c.id !== id),
    txns: d.txns.map((t) => (t.categoryId === id ? { ...t, categoryId: moveTo } : t)),
    budgets: d.budgets.filter((b) => b.categoryId !== id),
    rules: d.rules.filter((r) => r.categoryId !== id),
    recurring: d.recurring.map((r) => (r.categoryId === id ? { ...r, categoryId: moveTo } : r)),
  });

/* ---------- Budgets ---------- */

export const setBudget =
  (categoryId: string, amount: Minor, rollover: boolean, today: ISODate): Op =>
  (d) => {
    const existing = d.budgets.find((b) => b.categoryId === categoryId);
    const since = existing?.since ?? cycleOf(today, d.settings.cycleDay).start;
    const next: Budget = { categoryId, amount, rollover, since };
    return {
      ...d,
      budgets: existing
        ? d.budgets.map((b) => (b.categoryId === categoryId ? next : b))
        : [...d.budgets, next],
    };
  };

export const removeBudget =
  (categoryId: string): Op =>
  (d) => ({ ...d, budgets: d.budgets.filter((b) => b.categoryId !== categoryId) });

/* ---------- Recurring ---------- */

export const addRecurring =
  (r: Omit<Recurring, 'id'> & { id?: string }): Op =>
  (d) => ({ ...d, recurring: [...d.recurring, { ...r, id: r.id ?? uid('r') }] });

export const updateRecurring =
  (id: string, patch: Partial<Recurring>): Op =>
  (d) => ({ ...d, recurring: d.recurring.map((r) => (r.id === id ? { ...r, ...patch, id } : r)) });

export const removeRecurring =
  (id: string): Op =>
  (d) => ({ ...d, recurring: d.recurring.filter((r) => r.id !== id) });

/* ---------- Salary, target, settings, rates ---------- */

export const setSalary =
  (salary: Salary | null): Op =>
  (d) => ({ ...d, salary });

export const setTarget =
  (target: Target | null): Op =>
  (d) => ({ ...d, target });

export const setSettings =
  (patch: Partial<Settings>): Op =>
  (d) => ({ ...d, settings: { ...d.settings, ...patch } });

export const setRate =
  (code: string, rate: string, on: ISODate): Op =>
  (d) => ({ ...d, rates: { ...d.rates, [code]: { rate, on } } });

export const removeRate =
  (code: string): Op =>
  (d) => {
    const rates = { ...d.rates };
    delete rates[code];
    return { ...d, rates };
  };

export const dismiss =
  (id: string): Op =>
  (d) => ({ ...d, dismissed: [...new Set([...d.dismissed, id])].slice(-200) });

/* ---------- Rules ---------- */

/**
 * Remembers a merchant's category (and clean name) and applies it to every other uncategorised
 * transaction from the same merchant. Returns the op and how many it will touch.
 */
export function learnRule(
  data: LedgerData,
  raw: string,
  categoryId: string,
  payee?: string,
): { op: Op; others: number } {
  const match = ruleKey(raw);
  if (!match) return { op: (d) => d, others: 0 };
  const hits = (t: Txn) =>
    t.kind !== 'transfer' && !t.categoryId && merchantKey(t.payee).includes(match);
  const others = data.txns.filter(hits).length;
  const op: Op = (d) => {
    const rule: Rule = { id: uid('rule'), match, categoryId, payee, createdAt: Date.now() };
    return {
      ...d,
      rules: [...d.rules.filter((r) => r.match !== match), rule],
      txns: d.txns.map((t) => (hits(t) ? { ...t, categoryId } : t)),
    };
  };
  return { op, others };
}

export const removeRule =
  (id: string): Op =>
  (d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) });

/* ---------- Import ---------- */

export interface ImportMeta {
  kind: 'pdf' | 'csv';
  profile: string;
  fileName: string;
  accountId: string;
  from: ISODate;
  to: ISODate;
  closing?: Minor;
  /** Set the account's opening balance so it matches the statement to the fils. */
  opening?: { amount: Minor; on: ISODate };
}

export function applyImport(rows: readonly ReviewRow[], meta: ImportMeta): { op: Op; id: string } {
  const id = uid('imp');
  const op: Op = (d) => {
    const kept = rows.filter((r) => r.include);
    const now = Date.now();
    const txns = kept.map((r, i) => {
      const out = r.amount < 0;
      const transfer = r.kind === 'transfer' && r.toAccountId;
      const input: TxnInput = {
        date: r.date,
        kind: transfer ? 'transfer' : out ? 'expense' : 'income',
        accountId: transfer && !out ? r.toAccountId! : meta.accountId,
        toAccountId: transfer ? (out ? r.toAccountId : meta.accountId) : undefined,
        amount: Math.abs(r.amount),
        categoryId: transfer ? undefined : r.categoryId,
        payee: r.payee,
        note: r.raw !== r.payee ? r.raw : undefined,
        source: 'import',
        importId: id,
        fingerprint: r.fingerprint,
        createdAt: now + i,
      };
      return completeTxn(d, input);
    });
    const accounts = meta.opening
      ? d.accounts.map((a) =>
          a.id === meta.accountId
            ? { ...a, opening: meta.opening!.amount, openedOn: meta.opening!.on }
            : a,
        )
      : d.accounts;
    return {
      ...d,
      accounts,
      txns: [...d.txns, ...txns],
      imports: [
        ...d.imports,
        {
          id,
          at: now,
          kind: meta.kind,
          profile: meta.profile,
          fileName: meta.fileName,
          accountId: meta.accountId,
          count: kept.length,
          skipped: rows.length - kept.length,
          from: meta.from,
          to: meta.to,
          closing: meta.closing,
        },
      ],
    };
  };
  return { op, id };
}

export const undoImport =
  (importId: string): Op =>
  (d) => ({
    ...d,
    txns: d.txns.filter((t) => t.importId !== importId),
    imports: d.imports.filter((b) => b.id !== importId),
  });

/* ---------- Automatic posts ---------- */

/**
 * Posts what has fallen due since the app was last opened: the monthly salary (a transfer from
 * savings to spending) and recurring items set to post themselves.
 */
export function catchUp(data: LedgerData, today: ISODate): { data: LedgerData; posted: number } {
  let next = data;
  let posted = 0;
  const s = data.salary;
  if (s?.active) {
    const due = salaryDue(data, today);
    if (due.length) {
      const txns = due.map((date) =>
        completeTxn(next, {
          date,
          kind: 'transfer',
          accountId: s.fromAccountId,
          toAccountId: s.toAccountId,
          amount: convertFromBase(next, s.amount, s.fromAccountId),
          payee: 'Salary',
          note: 'Paid to yourself from savings',
          source: 'salary',
        }),
      );
      next = {
        ...next,
        txns: [...next.txns, ...txns],
        salary: { ...s, lastPostedOn: due[due.length - 1] },
      };
      posted += txns.length;
    }
  }
  const recurring = next.recurring.map((r) => {
    const dates = duePosts(r, today);
    if (!dates.length) return r;
    const txns = dates.map((date) =>
      completeTxn(next, {
        date,
        kind: r.kind,
        accountId: r.accountId,
        amount: r.amount,
        categoryId: r.categoryId,
        payee: r.name,
        source: 'recurring',
        recurringId: r.id,
      }),
    );
    next = { ...next, txns: [...next.txns, ...txns] };
    posted += txns.length;
    return { ...r, lastPostedOn: dates[dates.length - 1] };
  });
  if (recurring.some((r, i) => r !== next.recurring[i])) next = { ...next, recurring };
  return { data: next, posted };
}

function convertFromBase(data: LedgerData, baseAmount: Minor, accountId: string): Minor {
  const cur = accountCurrency(data, accountId);
  const rate = rateFor(data, cur);
  if (cur === data.settings.base || !rate) return baseAmount;
  return convert(baseAmount, data.settings.base, cur, invertRate(rate)) ?? baseAmount;
}

/** Marks a manual recurring item as paid today (or on its due date). */
export function payRecurring(data: LedgerData, id: string, date: ISODate): Op {
  const r = data.recurring.find((x) => x.id === id);
  if (!r) return (d) => d;
  return (d) => ({
    ...addTxn({
      date,
      kind: r.kind,
      accountId: r.accountId,
      amount: r.amount,
      categoryId: r.categoryId,
      payee: r.name,
      source: 'recurring',
      recurringId: r.id,
    })(d),
    recurring: d.recurring.map((x) => (x.id === id ? { ...x, lastPostedOn: date } : x)),
  });
}

export const replaceAll =
  (data: LedgerData): Op =>
  () =>
    data;
