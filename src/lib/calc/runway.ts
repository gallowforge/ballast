import { addDays, addMonths, cycleOf, maxDate, minDate, type ISODate } from '../dates';
import type { Minor } from '../money/money';
import type { Account, LedgerData } from '../model';
import { activeAccounts, savingsAccounts, toBase, totalOf } from '../ledger';
import { paydays, salaryPaid } from './cycle';
import { occurrences } from './recurring';
import { income, spending } from './stats';

export interface RunwayPoint {
  date: ISODate;
  balance: Minor;
}

export interface RunwayEvent {
  date: ISODate;
  delta: Minor;
  kind: 'salary' | 'income' | 'cost' | 'burn';
  label: string;
}

export interface TargetResult {
  date: ISODate;
  label: string;
  floor: Minor;
  /** Projected savings on the target date. */
  balanceAt: Minor;
  /** Paydays (or months) between now and the target date. */
  periods: number;
  status: 'reaches' | 'short';
  /** Above the floor on the target date (negative when short). */
  surplus: Minor;
  /** The largest monthly salary (or net monthly spend) that still reaches the target. */
  sustainable: Minor | null;
  /** Paydays between running out and the target date. */
  periodsShort: number;
}

export interface Runway {
  mode: 'salary' | 'average' | 'none';
  /** Savings now (salary mode) or all money now (average mode), in the base currency. */
  start: Minor;
  missing: Account[];
  /** The monthly draw: the salary, or the average net monthly outflow. */
  monthly: Minor;
  floor: Minor;
  events: RunwayEvent[];
  points: RunwayPoint[];
  /** The last payday that can be paid in full while staying above the floor. */
  lastFull: ISODate | null;
  /** The first payday that cannot (or the month money falls below the floor). */
  runOut: ISODate | null;
  /** Full paydays (or months) left from today. */
  periods: number;
  /** True when savings never run out within ten years. */
  lasts: boolean;
  target: TargetResult | null;
  horizon: ISODate;
}

export interface RunwayOptions {
  /** Try a different monthly salary without saving it. */
  salary?: Minor;
  /** Try a different target date. */
  targetDate?: ISODate;
}

const TEN_YEARS = 120;

/** Average net outflow per month over the last three full months that hold data. */
export function averageBurn(data: LedgerData, today: ISODate): { burn: Minor; months: number } {
  const day = data.settings.cycleDay;
  const first = data.txns.reduce<ISODate | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  if (!first) return { burn: 0, months: 0 };
  let total = 0;
  let months = 0;
  const current = cycleOf(today, day);
  for (let i = 1; i <= 3; i++) {
    const c = cycleOf(addMonths(current.start, -i), day);
    if (c.end < first) break;
    total += spending(data, c.start, c.end) - income(data, c.start, c.end);
    months++;
  }
  return { burn: months ? Math.round(total / months) : 0, months };
}

export function runway(data: LedgerData, today: ISODate, opts: RunwayOptions = {}): Runway {
  const target = data.target ? { ...data.target, date: opts.targetDate ?? data.target.date } : null;
  const floor = target?.floor ?? 0;
  const salary = data.salary?.active ? data.salary : null;
  const savings = savingsAccounts(data);

  if (salary && savings.length) return salaryRunway(data, today, savings, opts, floor, target);
  if (activeAccounts(data).length) return averageRunway(data, today, floor, target);
  return {
    mode: 'none',
    start: 0,
    missing: [],
    monthly: 0,
    floor,
    events: [],
    points: [],
    lastFull: null,
    runOut: null,
    periods: 0,
    lasts: false,
    target: null,
    horizon: today,
  };
}

function salaryRunway(
  data: LedgerData,
  today: ISODate,
  savings: Account[],
  opts: RunwayOptions,
  floor: Minor,
  target: LedgerData['target'],
): Runway {
  const s = data.salary!;
  const amount = opts.salary ?? s.amount;
  const { total: start, missing } = totalOf(data, savings, today);
  const ids = new Set(savings.map((a) => a.id));
  const limit = addMonths(today, TEN_YEARS);

  // Flows that touch savings after today: recurring money in or out of a savings account.
  const flows: RunwayEvent[] = [];
  for (const r of data.recurring) {
    if (!ids.has(r.accountId)) continue;
    const acct = savings.find((a) => a.id === r.accountId)!;
    const each = toBase(data, r.amount, acct.currency);
    if (each === null) continue;
    for (const d of occurrences(r, addDays(today, 1), limit, 2000))
      flows.push({
        date: d,
        delta: r.kind === 'income' ? each : -each,
        kind: r.kind === 'income' ? 'income' : 'cost',
        label: r.name,
      });
  }

  const firstFrom = salaryPaid(data, today) ? addDays(today, 1) : cycleOf(today, data.settings.cycleDay).start;
  const days = paydays(s, data.settings.cycleDay, firstFrom, limit).map((d) => maxDate(d, today));
  const draws: RunwayEvent[] = days.map((d) => ({ date: d, delta: -amount, kind: 'salary', label: 'Salary' }));
  const events = [...flows, ...draws].sort((a, b) =>
    a.date === b.date ? (a.kind === 'salary' ? 1 : b.kind === 'salary' ? -1 : 0) : a.date < b.date ? -1 : 1,
  );

  let bal = start;
  let lastFull: ISODate | null = null;
  let runOut: ISODate | null = null;
  let periods = 0;
  const points: RunwayPoint[] = [{ date: today, balance: bal }];
  const applied: RunwayEvent[] = [];
  for (const e of events) {
    let delta = e.delta;
    if (e.kind === 'salary') {
      if (!runOut && bal + delta >= floor) {
        lastFull = e.date;
        periods++;
      } else if (!runOut) runOut = e.date;
      delta = -Math.min(amount, Math.max(0, bal));
    }
    bal += delta;
    applied.push({ ...e, delta });
    points.push({ date: e.date, balance: bal });
  }

  const horizon = chooseHorizon(today, runOut, target?.date);
  const trimmed = trimPoints(points, horizon);
  const result: Runway = {
    mode: 'salary',
    start,
    missing,
    monthly: amount,
    floor,
    events: applied.filter((e) => e.date <= horizon),
    points: trimmed,
    lastFull,
    runOut,
    periods,
    lasts: runOut === null,
    target: null,
    horizon,
  };
  if (target) result.target = salaryTarget(start, floor, target, events, amount, runOut, days);
  return result;
}

function salaryTarget(
  start: Minor,
  floor: Minor,
  target: NonNullable<LedgerData['target']>,
  events: RunwayEvent[],
  amount: Minor,
  runOut: ISODate | null,
  days: ISODate[],
): TargetResult {
  const until = events.filter((e) => e.date <= target.date);
  const periods = until.filter((e) => e.kind === 'salary').length;
  const otherFlows = until.filter((e) => e.kind !== 'salary').reduce((s, e) => s + e.delta, 0);
  const balanceAt = start + otherFlows - periods * amount;
  const sustainable = periods > 0 ? Math.max(0, Math.floor((start - floor + otherFlows) / periods)) : null;
  const periodsShort = runOut && runOut <= target.date ? days.filter((d) => d >= runOut && d <= target.date).length : 0;
  return {
    date: target.date,
    label: target.label,
    floor,
    balanceAt,
    periods,
    status: balanceAt >= floor ? 'reaches' : 'short',
    surplus: balanceAt - floor,
    sustainable,
    periodsShort,
  };
}

function averageRunway(
  data: LedgerData,
  today: ISODate,
  floor: Minor,
  target: LedgerData['target'],
): Runway {
  const { total: start, missing } = totalOf(data, activeAccounts(data), today);
  const { burn } = averageBurn(data, today);
  const day = data.settings.cycleDay;
  const limit = addMonths(today, TEN_YEARS);
  const events: RunwayEvent[] = [];
  const points: RunwayPoint[] = [{ date: today, balance: start }];
  let bal = start;
  let runOut: ISODate | null = null;
  let lastFull: ISODate | null = null;
  let periods = 0;
  if (burn > 0) {
    let c = cycleOf(addMonths(cycleOf(today, day).start, 1), day);
    while (c.start <= limit) {
      const delta = -Math.min(burn, Math.max(0, bal));
      if (!runOut && bal - burn >= floor) {
        lastFull = c.start;
        periods++;
      } else if (!runOut) runOut = c.start;
      bal += delta;
      events.push({ date: c.start, delta, kind: 'burn', label: 'Average month' });
      points.push({ date: c.start, balance: bal });
      if (bal <= 0) break;
      c = cycleOf(addMonths(c.start, 1), day);
    }
  }
  const horizon = chooseHorizon(today, runOut, target?.date);
  let t: TargetResult | null = null;
  if (target) {
    let n = 0;
    for (let c = cycleOf(addMonths(cycleOf(today, day).start, 1), day); c.start <= target.date; c = cycleOf(addMonths(c.start, 1), day)) n++;
    // Uncapped: what the balance would be if the months kept coming, so a shortfall shows.
    const balanceAt = start - Math.max(0, burn) * n;
    t = {
      date: target.date,
      label: target.label,
      floor,
      balanceAt,
      periods: n,
      status: balanceAt >= floor ? 'reaches' : 'short',
      surplus: balanceAt - floor,
      sustainable: n > 0 ? Math.max(0, Math.floor((start - floor) / n)) : null,
      periodsShort: runOut && runOut <= target.date ? Math.max(0, n - periods) : 0,
    };
  }
  return {
    mode: 'average',
    start,
    missing,
    monthly: Math.max(0, burn),
    floor,
    events: events.filter((e) => e.date <= horizon),
    points: trimPoints(points, horizon),
    lastFull,
    runOut,
    periods,
    lasts: runOut === null,
    target: t,
    horizon,
  };
}

/** Far enough to show the story: past the target and the run-out month, at least a year. */
function chooseHorizon(today: ISODate, runOut: ISODate | null, target?: ISODate): ISODate {
  let h = addMonths(today, 12);
  if (target) h = maxDate(h, addMonths(target, 2));
  if (runOut) h = maxDate(h, addMonths(runOut, 2));
  else h = maxDate(h, addMonths(today, 24));
  return minDate(h, addMonths(today, TEN_YEARS));
}

function trimPoints(points: RunwayPoint[], horizon: ISODate): RunwayPoint[] {
  const kept = points.filter((p) => p.date <= horizon);
  const last = kept[kept.length - 1];
  if (last && last.date < horizon) kept.push({ date: horizon, balance: last.balance });
  return kept;
}
