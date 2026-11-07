import { convert } from './money/fx';
import type { Minor } from './money/money';
import type { Account, Category, ISODate, LedgerData, Txn } from './model';

/** Base-currency units per one unit of `code`, or null when no rate is known. */
export function rateFor(data: LedgerData, code: string): string | null {
  if (code === data.settings.base) return '1';
  return data.rates[code]?.rate ?? null;
}

/** Converts an amount in `code` to the base currency at the latest known rate. */
export function toBase(data: LedgerData, minor: Minor, code: string): Minor | null {
  const rate = rateFor(data, code);
  if (rate === null) return null;
  return convert(minor, code, data.settings.base, rate);
}

export function accountMap(data: LedgerData): Map<string, Account> {
  return new Map(data.accounts.map((a) => [a.id, a]));
}

export function categoryMap(data: LedgerData): Map<string, Category> {
  return new Map(data.categories.map((c) => [c.id, c]));
}

/** What a transaction does to one account's balance, in that account's currency. */
export function effectOn(txn: Txn, accountId: string): Minor {
  if (txn.kind === 'transfer') {
    let delta = 0;
    if (txn.accountId === accountId) delta -= txn.amount;
    if (txn.toAccountId === accountId) delta += txn.toAmount ?? txn.amount;
    return delta;
  }
  if (txn.accountId !== accountId) return 0;
  return txn.kind === 'income' ? txn.amount : -txn.amount;
}

/** Every account's balance in its own currency, optionally as of the end of a date. */
export function balances(data: LedgerData, asOf?: ISODate): Map<string, Minor> {
  const out = new Map<string, Minor>(data.accounts.map((a) => [a.id, a.opening]));
  for (const t of data.txns) {
    if (asOf && t.date > asOf) continue;
    if (t.kind === 'transfer') {
      if (out.has(t.accountId)) out.set(t.accountId, out.get(t.accountId)! - t.amount);
      if (t.toAccountId && out.has(t.toAccountId))
        out.set(t.toAccountId, out.get(t.toAccountId)! + (t.toAmount ?? t.amount));
    } else if (out.has(t.accountId)) {
      out.set(t.accountId, out.get(t.accountId)! + (t.kind === 'income' ? t.amount : -t.amount));
    }
  }
  return out;
}

export function balance(data: LedgerData, accountId: string, asOf?: ISODate): Minor {
  return balances(data, asOf).get(accountId) ?? 0;
}

export interface Totals {
  /** Sum in the base currency of the accounts that could be converted. */
  total: Minor;
  /** Accounts left out because their currency has no rate yet. */
  missing: Account[];
}

/** Total of a set of accounts in the base currency. */
export function totalOf(data: LedgerData, accounts: Account[], asOf?: ISODate): Totals {
  const bal = balances(data, asOf);
  let total = 0;
  const missing: Account[] = [];
  for (const a of accounts) {
    const v = toBase(data, bal.get(a.id) ?? 0, a.currency);
    if (v === null) missing.push(a);
    else total += v;
  }
  return { total, missing };
}

export function activeAccounts(data: LedgerData): Account[] {
  return data.accounts.filter((a) => !a.archived);
}

export function savingsAccounts(data: LedgerData): Account[] {
  return activeAccounts(data).filter((a) => a.role === 'savings');
}

export function spendingAccounts(data: LedgerData): Account[] {
  return activeAccounts(data).filter((a) => a.role === 'spending');
}

export function netWorth(data: LedgerData): Totals {
  return totalOf(data, activeAccounts(data));
}

/** Transactions sorted newest first, ties broken by creation time. */
export function sortedTxns(txns: readonly Txn[]): Txn[] {
  return [...txns].sort((a, b) =>
    a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
  );
}

export function txnsBetween(data: LedgerData, start: ISODate, end: ISODate): Txn[] {
  return data.txns.filter((t) => t.date >= start && t.date <= end);
}

/** The first and last dates that hold any transaction. */
export function dataRange(data: LedgerData): { first: ISODate; last: ISODate } | null {
  if (!data.txns.length) return null;
  let first = data.txns[0]!.date;
  let last = first;
  for (const t of data.txns) {
    if (t.date < first) first = t.date;
    if (t.date > last) last = t.date;
  }
  return { first, last };
}
