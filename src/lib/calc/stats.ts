import { addDays, eachDay, weekday, type Cycle } from '../dates';
import type { Minor } from '../money/money';
import type { ISODate, LedgerData, Txn } from '../model';

export type TxnFilter = (t: Txn) => boolean;

const isExpense: TxnFilter = (t) => t.kind === 'expense';
const isIncome: TxnFilter = (t) => t.kind === 'income';

function total(data: LedgerData, start: ISODate, end: ISODate, keep: TxnFilter): Minor {
  let sum = 0;
  for (const t of data.txns) if (t.date >= start && t.date <= end && keep(t)) sum += t.base;
  return sum;
}

/** Money spent between two dates (inclusive), in the base currency. Transfers never count. */
export function spending(data: LedgerData, start: ISODate, end: ISODate, keep?: TxnFilter): Minor {
  return total(data, start, end, keep ? (t) => isExpense(t) && keep(t) : isExpense);
}

/** Money earned between two dates (inclusive), in the base currency. */
export function income(data: LedgerData, start: ISODate, end: ISODate, keep?: TxnFilter): Minor {
  return total(data, start, end, keep ? (t) => isIncome(t) && keep(t) : isIncome);
}

export interface CategoryTotal {
  categoryId: string;
  total: Minor;
  count: number;
}

/** Totals per category, largest first. Uncategorised money is grouped under "". */
export function byCategory(
  data: LedgerData,
  start: ISODate,
  end: ISODate,
  kind: 'expense' | 'income' = 'expense',
): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const t of data.txns) {
    if (t.kind !== kind || t.date < start || t.date > end) continue;
    const id = t.categoryId ?? '';
    const row = map.get(id) ?? { categoryId: id, total: 0, count: 0 };
    row.total += t.base;
    row.count += 1;
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Spending per day, every day in the range present (zero when nothing was spent). */
export function byDay(data: LedgerData, start: ISODate, end: ISODate): Map<ISODate, Minor> {
  const out = new Map<ISODate, Minor>(eachDay(start, end).map((d) => [d, 0]));
  for (const t of data.txns) {
    if (t.kind !== 'expense' || !out.has(t.date)) continue;
    out.set(t.date, out.get(t.date)! + t.base);
  }
  return out;
}

/** Average spending per weekday (0 = Sunday) across the range. */
export function byWeekday(data: LedgerData, start: ISODate, end: ISODate): Minor[] {
  const totals = Array<number>(7).fill(0);
  const counts = Array<number>(7).fill(0);
  for (const [d, v] of byDay(data, start, end)) {
    const w = weekday(d);
    totals[w]! += v;
    counts[w]! += 1;
  }
  return totals.map((t, i) => (counts[i] ? Math.round(t / counts[i]!) : 0));
}

export interface CashflowRow {
  cycle: Cycle;
  income: Minor;
  spending: Minor;
  net: Minor;
}

export function cashflow(data: LedgerData, cycles: Cycle[]): CashflowRow[] {
  return cycles.map((cycle) => {
    const inc = income(data, cycle.start, cycle.end);
    const out = spending(data, cycle.start, cycle.end);
    return { cycle, income: inc, spending: out, net: inc - out };
  });
}

export interface PayeeTotal {
  payee: string;
  total: Minor;
  count: number;
  categoryId?: string;
}

export function topPayees(data: LedgerData, start: ISODate, end: ISODate, n = 5): PayeeTotal[] {
  const map = new Map<string, PayeeTotal>();
  for (const t of data.txns) {
    if (t.kind !== 'expense' || t.date < start || t.date > end) continue;
    const key = t.payee.trim().toLowerCase();
    if (!key) continue;
    const row = map.get(key) ?? { payee: t.payee, total: 0, count: 0, categoryId: t.categoryId };
    row.total += t.base;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

/** Running total of spending through the range, one value per day. */
export function cumulative(data: LedgerData, start: ISODate, end: ISODate): Minor[] {
  let run = 0;
  return [...byDay(data, start, end).values()].map((v) => (run += v));
}

/** The median of a list of amounts (0 for an empty list). */
export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Days in a range, inclusive. */
export function spanDays(start: ISODate, end: ISODate): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) n++;
  return n;
}
