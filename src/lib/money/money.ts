import { currency } from './currency';

/** An integer number of minor units (fils, cents). Always a safe integer. */
export type Minor = number;

const GROUP = /\B(?=(\d{3})+(?!\d))/g;
const GROUPING = new RegExp('[\\s,\\u066C]', 'g');

/**
 * Parses a decimal string into minor units without ever touching floating point.
 * Accepts "1234.5", "1,234.500", "-0.250", ".5". Returns null for anything else, or when the
 * string has more decimals than the currency allows ("1.2345" for KWD).
 */
export function parseMinor(input: string, exp: number): Minor | null {
  // Spaces, commas and the Arabic thousands separator (U+066C) are all grouping marks.
  const s = input.trim().replace(GROUPING, '');
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const [, sign, whole = '', frac = ''] = m;
  if (whole === '' && frac === '') return null;
  if (frac.length > exp) return null;
  const digits = (whole || '0') + frac.padEnd(exp, '0');
  const n = Number(digits);
  if (!Number.isSafeInteger(n)) return null;
  return sign === '-' ? -n : n;
}

/** Parses what a person typed in an amount field. Never negative, never zero. */
export function parseAmountInput(input: string, code: string): Minor | null {
  const n = parseMinor(input, currency(code).exp);
  if (n === null || n <= 0) return null;
  return n;
}

export interface FormatOptions {
  /** 'auto' shows a minus for negatives; 'always' adds + for positives; 'never' drops signs. */
  sign?: 'auto' | 'always' | 'never';
  /** Thousands separators (default true). */
  group?: boolean;
}

/** "1,234.500" for 1234500 fils. Exact: built from the integer, not from a float. */
export function formatMinor(minor: Minor, exp: number, opts: FormatOptions = {}): string {
  const { sign = 'auto', group = true } = opts;
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const digits = String(abs).padStart(exp + 1, '0');
  let whole = exp ? digits.slice(0, -exp) : digits;
  const frac = exp ? digits.slice(-exp) : '';
  if (group) whole = whole.replace(GROUP, ',');
  const body = frac ? `${whole}.${frac}` : whole;
  if (sign === 'never') return body;
  if (neg) return `−${body}`;
  if (sign === 'always' && abs > 0) return `+${body}`;
  return body;
}

/** "1,234.500 KD". */
export function formatMoney(minor: Minor, code: string, opts: FormatOptions = {}): string {
  const c = currency(code);
  return `${formatMinor(minor, c.exp, opts)} ${c.label}`;
}

export interface MoneyParts {
  sign: '' | '−' | '+';
  whole: string;
  fraction: string;
  unit: string;
}

/** Splits an amount for typography: the fils are drawn lighter than the dinars. */
export function moneyParts(minor: Minor, code: string, opts: FormatOptions = {}): MoneyParts {
  const c = currency(code);
  const text = formatMinor(minor, c.exp, opts);
  const sign = text.startsWith('−') ? '−' : text.startsWith('+') ? '+' : '';
  const body = sign ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = body.split('.');
  return { sign, whole, fraction, unit: c.label };
}

/** A short label for chart axes: 950, 1.2k, 14k, 1.5M (in major units). */
export function formatCompact(minor: Minor, code: string): string {
  const major = minor / 10 ** currency(code).exp;
  const abs = Math.abs(major);
  const sign = major < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}k`;
  return `${sign}${Math.round(abs)}`;
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

/** Whole major units, rounded: 1234500 fils → "1,235 KD" for headlines that need no fils. */
export function formatRounded(minor: Minor, code: string): string {
  const c = currency(code);
  const major = Math.sign(minor) * Math.round(Math.abs(minor) / 10 ** c.exp);
  const body = String(Math.abs(major)).replace(GROUP, ',');
  return `${major < 0 ? '−' : ''}${body} ${c.label}`;
}

export function sum(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Splits an amount into `parts` integer shares, flooring (never overspends). */
export function share(minor: Minor, parts: number): Minor {
  if (parts <= 0) return 0;
  return Math.floor(minor / parts);
}

/** Rounds to the nearest `step` minor units (e.g. 500 fils), toward zero. */
export function floorTo(minor: Minor, step: number): Minor {
  if (step <= 1) return Math.trunc(minor);
  return Math.trunc(minor / step) * step;
}
