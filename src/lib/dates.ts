/**
 * Calendar dates as ISO strings ("2026-11-08") in the person's local calendar. Arithmetic runs on
 * UTC midnights so daylight-saving changes can never shift a day.
 */
export type ISODate = string;

const DAY = 86_400_000;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Today in the device's local time zone. */
export function today(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function parts(date: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

function utc(date: ISODate): number {
  const { y, m, d } = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTC(utc(date) + n * DAY);
}

/** Adds months, clamping the day: 31 January + 1 month is 28 or 29 February. */
export function addMonths(date: ISODate, n: number): ISODate {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utc(b) - utc(a)) / DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: ISODate): number {
  return new Date(utc(date)).getUTCDay();
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** The date in month (y, m) for a given day, clamped to the month's length. */
export function dayInMonth(y: number, m: number, day: number): ISODate {
  return toISO(y, m, Math.min(day, daysInMonth(y, m)));
}

export interface Cycle {
  /** First day, inclusive. */
  start: ISODate;
  /** Last day, inclusive. */
  end: ISODate;
  days: number;
}

/**
 * The money month that contains `date` when it starts on `startDay` (1 to 28). With a payday on
 * the 25th, 8 November falls in the cycle from 25 October to 24 November.
 */
export function cycleOf(date: ISODate, startDay: number): Cycle {
  const day = Math.min(Math.max(Math.trunc(startDay) || 1, 1), 28);
  const { y, m, d } = parts(date);
  let start = dayInMonth(y, m, day);
  if (d < day) start = addMonths(start, -1);
  const next = addMonths(start, 1);
  const end = addDays(next, -1);
  return { start, end, days: diffDays(start, next) };
}

/** The cycle `offset` cycles away from the one containing `date` (−1 is last month). */
export function cycleAt(date: ISODate, startDay: number, offset: number): Cycle {
  const c = cycleOf(date, startDay);
  return cycleOf(addMonths(c.start, offset), startDay);
}

export function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Whole months between two dates (b later than a), counting a month when the day is reached. */
export function monthsBetween(a: ISODate, b: ISODate): number {
  const pa = parts(a);
  const pb = parts(b);
  let n = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  if (pb.d < pa.d && pb.d < daysInMonth(pb.y, pb.m)) n -= 1;
  return n;
}

/* ---------- Display, English, day-month order ---------- */

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' });
const F = {
  short: fmt({ day: 'numeric', month: 'short' }),
  shortYear: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
  long: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
  day: fmt({ weekday: 'short', day: 'numeric', month: 'short' }),
  dayLong: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  weekday: fmt({ weekday: 'long' }),
  weekdayShort: fmt({ weekday: 'short' }),
  month: fmt({ month: 'long', year: 'numeric' }),
  monthName: fmt({ month: 'long' }),
  monthShort: fmt({ month: 'short' }),
  monthShortYear: fmt({ month: 'short', year: 'numeric' }),
};

const at = (date: ISODate) => new Date(utc(date));

/** "8 Nov", or "8 Nov 2025" when it is not this year. */
export function formatShort(date: ISODate, ref: ISODate = today()): string {
  return (parts(date).y === parts(ref).y ? F.short : F.shortYear).format(at(date));
}
/** "8 November 2026". */
export function formatLong(date: ISODate): string {
  return F.long.format(at(date));
}
/** "Sun 8 Nov". */
export function formatDay(date: ISODate): string {
  return F.day.format(at(date)).replace(',', '');
}
/** "Sunday 8 November". */
export function formatDayLong(date: ISODate): string {
  return F.dayLong.format(at(date)).replace(',', '');
}
export function formatWeekday(date: ISODate, short = false): string {
  return (short ? F.weekdayShort : F.weekday).format(at(date));
}
/** "November 2026". */
export function formatMonth(date: ISODate): string {
  return F.month.format(at(date));
}
export function formatMonthName(date: ISODate): string {
  return F.monthName.format(at(date));
}
/** "Nov", or "Nov 2025" with `withYear`. */
export function formatMonthShort(date: ISODate, withYear = false): string {
  return (withYear ? F.monthShortYear : F.monthShort).format(at(date));
}

/** "Today", "Yesterday", "Tomorrow", a weekday within the last week, else "8 Nov". */
export function formatRelative(date: ISODate, ref: ISODate = today()): string {
  const n = diffDays(ref, date);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  if (n < 0 && n > -7) return formatWeekday(date);
  return formatShort(date, ref);
}

/** "in 3 days", "tomorrow", "today", "3 days ago". */
export function formatIn(date: ISODate, ref: ISODate = today()): string {
  const n = diffDays(ref, date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "1 year, 4 months", "7 months", "3 weeks", "5 days". */
export function formatSpan(from: ISODate, to: ISODate): string {
  const days = diffDays(from, to);
  if (days < 0) return '0 days';
  const months = monthsBetween(from, to);
  if (months >= 12) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return `${plural(y, 'year')}${m ? `, ${plural(m, 'month')}` : ''}`;
  }
  if (months >= 1) return plural(months, 'month');
  if (days >= 14) return plural(Math.floor(days / 7), 'week');
  return plural(days, 'day');
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? word : many}`;
}

/** Ordinal for a day of the month: 1st, 2nd, 3rd, 25th. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
