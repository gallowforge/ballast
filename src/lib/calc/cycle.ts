import { addDays, addMonths, cycleOf, diffDays, type Cycle, type ISODate } from '../dates';
import type { Minor } from '../money/money';
import type { Account, LedgerData, Salary, Txn } from '../model';
import { activeAccounts, spendingAccounts, toBase } from '../ledger';
import { occurrences } from './recurring';

/** Paydays (cycle starts) between two dates, inclusive, never before the salary started. */
export function paydays(salary: Salary, cycleDay: number, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let c = cycleOf(from, cycleDay);
  if (c.start < from) c = cycleOf(addMonths(c.start, 1), cycleDay);
  for (let i = 0; i < 600 && c.start <= to; i++) {
    if (c.start >= cycleOf(salary.startedOn, cycleDay).start) out.push(c.start);
    c = cycleOf(addMonths(c.start, 1), cycleDay);
  }
  return out;
}

/** True when this money month's salary has already moved to the spending account. */
export function salaryPaid(data: LedgerData, today: ISODate): boolean {
  const s = data.salary;
  if (!s) return false;
  const c = cycleOf(today, data.settings.cycleDay);
  if (s.lastPostedOn && s.lastPostedOn >= c.start) return true;
  return data.txns.some(
    (t) =>
      t.kind === 'transfer' &&
      t.date >= c.start &&
      t.date <= c.end &&
      t.accountId === s.fromAccountId &&
      t.toAccountId === s.toAccountId &&
      t.base * 2 >= s.amount,
  );
}

/** Paydays the app should post now (automatic salary that has fallen due), at most 24. */
export function salaryDue(data: LedgerData, today: ISODate): ISODate[] {
  const s = data.salary;
  if (!s || !s.active || !s.autoPost) return [];
  const from = s.lastPostedOn ? addDays(s.lastPostedOn, 1) : s.startedOn;
  return paydays(s, data.settings.cycleDay, from, today).slice(-24);
}

/** The accounts whose spending comes out of the monthly salary. */
export function salaryAccounts(data: LedgerData): Account[] {
  const spend = spendingAccounts(data);
  if (spend.length) return spend;
  return activeAccounts(data).filter((a) => a.role !== 'savings');
}

export interface DayPoint {
  date: ISODate;
  value: Minor;
}

export interface CycleSummary {
  cycle: Cycle;
  today: ISODate;
  /** Days left including today. */
  daysLeft: number;
  /** Days gone including today. */
  daysGone: number;
  source: 'salary' | 'budgets' | 'none';
  /** What this month has to spend: the salary, or the sum of budgets without one. */
  allowance: Minor;
  /** Other money that landed in the spending accounts this month (refunds, gifts). */
  extra: Minor;
  spent: Minor;
  left: Minor;
  /** Recurring costs from the spending accounts still to come before the month ends. */
  billsAhead: Minor;
  safe: Minor;
  perDay: Minor;
  /** Positive when spending runs ahead of an even pace. */
  pace: Minor;
  /** What is left at the end of each day so far. */
  actual: DayPoint[];
  /** If spending keeps its average pace, what is left at month end (may be negative). */
  projectedEnd: Minor;
  /** The day money runs out at the current pace, if before month end. */
  runsOutOn: ISODate | null;
}

export function cycleSummary(data: LedgerData, today: ISODate): CycleSummary {
  const cycle = cycleOf(today, data.settings.cycleDay);
  const accounts = new Set(salaryAccounts(data).map((a) => a.id));
  const all = accounts.size === 0;
  const counts = (t: Txn) => all || accounts.has(t.accountId);
  const s = data.salary?.active ? data.salary : null;

  let allowance = 0;
  let source: CycleSummary['source'] = 'none';
  if (s) {
    allowance = s.amount;
    source = 'salary';
  } else if (data.budgets.length) {
    allowance = data.budgets.reduce((sum, b) => sum + b.amount, 0);
    source = 'budgets';
  }

  const daily = new Map<ISODate, Minor>();
  let spent = 0;
  let extra = 0;
  for (const t of data.txns) {
    if (t.date < cycle.start || t.date > cycle.end || t.kind === 'transfer' || !counts(t)) continue;
    if (t.kind === 'expense') {
      if (t.date <= today) spent += t.base;
      daily.set(t.date, (daily.get(t.date) ?? 0) - t.base);
    } else {
      if (t.date <= today) extra += t.base;
      daily.set(t.date, (daily.get(t.date) ?? 0) + t.base);
    }
  }

  const left = allowance + extra - spent;
  const daysGone = diffDays(cycle.start, today) + 1;
  const daysLeft = cycle.days - daysGone + 1;

  const posted = new Set(
    data.txns.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`),
  );
  let billsAhead = 0;
  for (const r of data.recurring) {
    if (r.kind !== 'expense' || !(all || accounts.has(r.accountId))) continue;
    const acct = data.accounts.find((a) => a.id === r.accountId);
    const each = acct ? (toBase(data, r.amount, acct.currency) ?? r.amount) : r.amount;
    for (const d of occurrences(r, today, cycle.end))
      if (!posted.has(`${r.id}|${d}`)) billsAhead += each;
  }

  const safe = Math.max(0, left - billsAhead);
  const perDay = Math.floor(safe / Math.max(1, daysLeft));

  // Pace and projection look at everyday spending only: fixed bills land on their own dates and
  // would otherwise make the start of every month look like overspending.
  let fixedPosted = 0;
  for (const t of data.txns)
    if (
      t.recurringId &&
      t.kind === 'expense' &&
      t.date >= cycle.start &&
      t.date <= today &&
      counts(t)
    )
      fixedPosted += t.base;
  const flexSpent = spent - fixedPosted;
  const flexBudget = allowance + extra - fixedPosted - billsAhead;
  const pace = allowance ? flexSpent - Math.round((flexBudget * daysGone) / cycle.days) : 0;

  const actual: DayPoint[] = [];
  let run = allowance;
  for (let d = cycle.start; d <= today; d = addDays(d, 1)) {
    run += daily.get(d) ?? 0;
    actual.push({ date: d, value: run });
  }

  const avg = flexSpent / Math.max(1, daysGone);
  const projectedEnd = Math.round(left - billsAhead - avg * (daysLeft - 1));
  let runsOutOn: ISODate | null = null;
  if (allowance && avg > 0 && projectedEnd < 0) {
    const days = Math.floor(Math.max(0, left - billsAhead) / avg);
    runsOutOn = addDays(today, days);
    if (runsOutOn > cycle.end) runsOutOn = null;
  }

  return {
    cycle,
    today,
    daysLeft,
    daysGone,
    source,
    allowance,
    extra,
    spent,
    left,
    billsAhead,
    safe,
    perDay,
    pace,
    actual,
    projectedEnd,
    runsOutOn,
  };
}
