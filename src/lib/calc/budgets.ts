import { addMonths, cycleOf, diffDays, type Cycle, type ISODate } from '../dates';
import type { Minor } from '../money/money';
import { exponent } from '../money/currency';
import type { Budget, LedgerData } from '../model';
import { spending } from './stats';

export type BudgetStatus = 'idle' | 'ok' | 'ahead' | 'over';

export interface BudgetState {
  budget: Budget;
  cycle: Cycle;
  /** Carried in from earlier months when rollover is on (negative after overspending). */
  carry: Minor;
  available: Minor;
  spent: Minor;
  left: Minor;
  /** Share of the month gone, 0 to 1. */
  elapsed: number;
  /** Share of the available money spent (can pass 1). */
  used: number;
  status: BudgetStatus;
  perDayLeft: Minor;
}

function spentIn(data: LedgerData, categoryId: string, c: Cycle): Minor {
  return spending(data, c.start, c.end, (t) => t.categoryId === categoryId);
}

/** Rolled-over money from the months between `since` and the cycle before `cycle` (24 at most). */
export function carryInto(data: LedgerData, b: Budget, cycle: Cycle): Minor {
  if (!b.rollover) return 0;
  const day = data.settings.cycleDay;
  let c = cycleOf(addMonths(cycle.start, -24), day);
  const first = cycleOf(b.since, day);
  if (c.start < first.start) c = first;
  let carry = 0;
  while (c.start < cycle.start) {
    carry += b.amount - spentIn(data, b.categoryId, c);
    c = cycleOf(addMonths(c.start, 1), day);
  }
  return carry;
}

export function budgetState(data: LedgerData, b: Budget, today: ISODate): BudgetState {
  const cycle = cycleOf(today, data.settings.cycleDay);
  const carry = carryInto(data, b, cycle);
  const available = b.amount + carry;
  const spent = spentIn(data, b.categoryId, cycle);
  const left = available - spent;
  const gone = diffDays(cycle.start, today) + 1;
  const elapsed = Math.min(1, gone / cycle.days);
  const used = available > 0 ? spent / available : spent > 0 ? Infinity : 0;
  let status: BudgetStatus = 'ok';
  if (spent === 0) status = 'idle';
  else if (spent > available) status = 'over';
  // Ahead of pace: more than 10% beyond an even pace, and at least a tenth of the budget spent.
  else if (used > elapsed * 1.1 && used > 0.1) status = 'ahead';
  const daysLeft = cycle.days - gone + 1;
  return {
    budget: b,
    cycle,
    carry,
    available,
    spent,
    left,
    elapsed,
    used,
    status,
    perDayLeft: left > 0 ? Math.floor(left / daysLeft) : 0,
  };
}

export function budgetStates(data: LedgerData, today: ISODate): BudgetState[] {
  return data.budgets.map((b) => budgetState(data, b, today));
}

export interface BudgetTotals {
  budgeted: Minor;
  spent: Minor;
  /** Spending this month in categories that have no budget. */
  unbudgeted: Minor;
}

export function budgetTotals(data: LedgerData, today: ISODate): BudgetTotals {
  const cycle = cycleOf(today, data.settings.cycleDay);
  const ids = new Set(data.budgets.map((b) => b.categoryId));
  const states = budgetStates(data, today);
  return {
    budgeted: states.reduce((s, b) => s + b.available, 0),
    spent: states.reduce((s, b) => s + b.spent, 0),
    unbudgeted: spending(
      data,
      cycle.start,
      cycle.end,
      (t) => !t.categoryId || !ids.has(t.categoryId),
    ),
  };
}

/**
 * A suggested budget: the average of the last three full months, rounded up to a whole unit of the
 * main currency (a whole dollar, euro or dinar).
 */
export function suggestBudget(
  data: LedgerData,
  categoryId: string,
  today: ISODate,
  unit = 10 ** exponent(data.settings.base),
): Minor {
  const day = data.settings.cycleDay;
  let total = 0;
  let months = 0;
  for (let i = 1; i <= 3; i++) {
    const c = cycleOf(addMonths(cycleOf(today, day).start, -i), day);
    const hasData = data.txns.some((t) => t.date >= c.start && t.date <= c.end);
    if (!hasData) continue;
    total += spentIn(data, categoryId, c);
    months++;
  }
  if (!months) return 0;
  return Math.ceil(total / months / unit) * unit;
}
