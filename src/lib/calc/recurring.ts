import { addDays, addMonths, diffDays, type ISODate } from '../dates';
import type { Minor } from '../money/money';
import type { LedgerData, Recurring, Unit } from '../model';

/** The n-th occurrence (0-based) of a schedule. Months clamp to short months but keep the anchor day. */
export function nth(startOn: ISODate, every: number, unit: Unit, n: number): ISODate {
  const step = Math.max(1, Math.trunc(every) || 1);
  if (unit === 'week') return addDays(startOn, 7 * step * n);
  if (unit === 'year') return addMonths(startOn, 12 * step * n);
  return addMonths(startOn, step * n);
}

/** Occurrences of a recurring item that fall between two dates (inclusive). */
export function occurrences(r: Recurring, from: ISODate, to: ISODate, limit = 400): ISODate[] {
  const out: ISODate[] = [];
  if (to < r.startOn) return out;
  // Jump close to `from` instead of walking from the start date.
  let n = 0;
  if (from > r.startOn) {
    const days = diffDays(r.startOn, from);
    const per = r.unit === 'week' ? 7 * r.every : r.unit === 'year' ? 365 * r.every : 30 * r.every;
    n = Math.max(0, Math.floor(days / per) - 2);
  }
  for (; out.length < limit; n++) {
    const d = nth(r.startOn, r.every, r.unit, n);
    if (d > to || (r.endOn && d > r.endOn)) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** The next time it falls due on or after `date`, or null when it has ended. */
export function nextDue(r: Recurring, date: ISODate): ISODate | null {
  return occurrences(r, date, addMonths(date, 12 * Math.max(1, r.every) + 1), 1)[0] ?? null;
}

/** What it costs per month on average, in its own minor units. */
export function monthlyEquivalent(r: Pick<Recurring, 'amount' | 'every' | 'unit'>): Minor {
  const every = Math.max(1, r.every);
  if (r.unit === 'week') return Math.round((r.amount * 52) / 12 / every);
  if (r.unit === 'year') return Math.round(r.amount / 12 / every);
  return Math.round(r.amount / every);
}

export function yearlyEquivalent(r: Pick<Recurring, 'amount' | 'every' | 'unit'>): Minor {
  const every = Math.max(1, r.every);
  if (r.unit === 'week') return Math.round((r.amount * 52) / every);
  if (r.unit === 'year') return Math.round(r.amount / every);
  return Math.round((r.amount * 12) / every);
}

/** "every month", "every 2 weeks", "every year". */
export function describeCadence(r: Pick<Recurring, 'every' | 'unit'>): string {
  return r.every === 1 ? `every ${r.unit}` : `every ${r.every} ${r.unit}s`;
}

export interface Upcoming {
  recurring: Recurring;
  date: ISODate;
}

/** Everything due between two dates, soonest first. */
export function upcoming(data: LedgerData, from: ISODate, to: ISODate): Upcoming[] {
  const out: Upcoming[] = [];
  for (const r of data.recurring)
    for (const date of occurrences(r, from, to)) out.push({ recurring: r, date });
  return out.sort((a, b) => (a.date === b.date ? a.recurring.amount - b.recurring.amount : a.date < b.date ? -1 : 1));
}

/** Dates an auto-posting item should have posted by today but has not yet (at most 24). */
export function duePosts(r: Recurring, today: ISODate): ISODate[] {
  if (!r.autoPost) return [];
  const from = r.lastPostedOn ? addDays(r.lastPostedOn, 1) : r.startOn;
  return occurrences(r, from, today, 24);
}
