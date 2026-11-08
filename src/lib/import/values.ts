import { isISODate, toISO, type ISODate } from '../dates';

export type DateOrder = 'dmy' | 'mdy' | 'ymd';

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function year(y: string): number {
  const n = Number(y);
  return y.length <= 2 ? 2000 + n : n;
}

function build(y: number, m: number, d: number): ISODate | null {
  const iso = toISO(y, m, d);
  return isISODate(iso) && y >= 1990 && y <= 2100 ? iso : null;
}

/**
 * Reads a statement date: 08/11/2026, 8-11-26, 08.11.2026, 2026-11-08, 08 Nov 2026, 08-NOV-2026,
 * 08NOV26, Nov 8, 2026. A trailing time is ignored. Numeric dates follow `order`.
 */
export function parseDate(raw: string, order: DateOrder = 'dmy'): ISODate | null {
  const s = raw
    .trim()
    .replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?$/i, '')
    .replace(/,/g, ' ')
    .trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = year(m[3]!);
    return order === 'mdy' ? build(y, a, b) : build(y, b, a);
  }
  m = /^(\d{1,2})[\s-]*([A-Za-z]{3,9})\.?[\s-]*(\d{2}|\d{4})$/.exec(s);
  if (m && MONTHS[m[2]!.toLowerCase()])
    return build(year(m[3]!), MONTHS[m[2]!.toLowerCase()]!, Number(m[1]));
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1]!.toLowerCase()])
    return build(Number(m[3]), MONTHS[m[1]!.toLowerCase()]!, Number(m[2]));
  return null;
}

/** True when the text looks like a date in any supported layout. */
export function looksLikeDate(raw: string): boolean {
  return parseDate(raw, 'dmy') !== null || parseDate(raw, 'mdy') !== null;
}

/**
 * Decides day-first or month-first from a column of dates. Any first number above 12 proves
 * day-first; any second number above 12 proves month-first; otherwise day-first (the convention
 * in Kuwait and most of the world).
 */
export function detectDateOrder(values: readonly string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  if (values.some((v) => /^\d{4}[-/.]/.test(v.trim()))) return 'ymd';
  return mdy > dmy ? 'mdy' : 'dmy';
}

export interface ParsedAmount {
  /** Signed minor units. */
  minor: number;
  /** The text carried its own sign (minus, brackets, DR or CR). */
  signed: boolean;
}

/** Comma decimals when values look like 1.234,56 or 12,50; dots otherwise. */
export function detectDecimal(values: readonly string[]): '.' | ',' {
  let comma = 0;
  let dot = 0;
  for (const v of values) {
    const s = v.replace(/[^\d.,]/g, '');
    if (/\.\d{3},\d+$/.test(s) || /,\d{1,2}$/.test(s) || /\d{4,},\d+$/.test(s)) comma++;
    else if (/,\d{3}\.\d+$/.test(s) || /\.\d{1,3}$/.test(s)) dot++;
  }
  return comma > dot ? ',' : '.';
}

/**
 * Reads a statement amount into signed minor units: 1,234.567 · 1.234,56 · (12.500) · -12.5 ·
 * 12.500- · 12.500 DR · 12.500 CR · KWD 12.500 · 12.500 KD. Extra decimals round half up.
 */
export function parseAmount(
  raw: string,
  exp: number,
  decimal: '.' | ',' = '.',
): ParsedAmount | null {
  let s = raw.trim().replace(/ /g, ' ');
  if (!s || /^[-–—]$/.test(s)) return null;
  let neg = false;
  let signed = false;
  const marker = /(?:\s+(DR|CR|D|C)|(?<=\d)(DR|CR))\.?$/i.exec(s);
  if (marker) {
    neg = (marker[1] ?? marker[2])!.toUpperCase().startsWith('D');
    signed = true;
    s = s.slice(0, marker.index);
  }
  s = s.replace(/[A-Za-z]{2,4}\.?/g, '').trim();
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    signed = true;
    s = s.slice(1, -1);
  }
  if (/^[-−–]/.test(s)) {
    neg = true;
    signed = true;
    s = s.slice(1);
  } else if (/^\+/.test(s)) {
    signed = true;
    s = s.slice(1);
  } else if (/[-−–]$/.test(s)) {
    neg = true;
    signed = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/\s/g, '');
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s) ?? /^()\.(\d+)$/.exec(s);
  if (!m) return null;
  const whole = m[1] || '0';
  let frac = m[2] ?? '';
  let carry = 0;
  if (frac.length > exp) {
    carry = Number(frac[exp]) >= 5 ? 1 : 0;
    frac = frac.slice(0, exp);
  }
  let minor = Number(whole + frac.padEnd(exp, '0')) + carry;
  if (!Number.isSafeInteger(minor)) return null;
  if (neg) minor = -minor;
  return { minor, signed };
}

export function looksLikeAmount(raw: string): boolean {
  const s = raw.trim();
  if (!/\d/.test(s) || s.length > 24) return false;
  if (looksLikeDate(s)) return false;
  return /^[(\-−+]?\s*(?:[A-Za-z]{2,4}\.?\s*)?[\d.,\s]*\d(?:[.,]\d+)?\s*(?:[A-Za-z]{2,4}\.?)?\s*[)\-]?\s*(?:DR|CR)?\.?$/i.test(
    s,
  );
}
