import { currency } from './currency';
import type { Minor } from './money';

/**
 * Exchange rates are kept as decimal strings ("0.30705" = 1 USD is 0.30705 KD) and applied with
 * BigInt, so a conversion is exact up to the final rounding (half away from zero).
 */
export interface Fraction {
  num: bigint;
  den: bigint;
}

export function parseRate(input: string): Fraction | null {
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d*)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[1] === '' && !m[2])) return null;
  const whole = m[1] || '0';
  const frac = m[2] ?? '';
  if (frac.length > 12) return null;
  const num = BigInt(whole + frac);
  if (num === 0n) return null;
  return { num, den: 10n ** BigInt(frac.length) };
}

function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

/** Converts `minor` units of `from` into minor units of `to` at `rate` (to per one from). */
export function convert(minor: Minor, from: string, to: string, rate: string): Minor | null {
  if (from === to) return minor;
  const r = parseRate(rate);
  if (!r) return null;
  const fe = currency(from).exp;
  const te = currency(to).exp;
  const n = BigInt(minor) * r.num * 10n ** BigInt(te);
  const d = r.den * 10n ** BigInt(fe);
  return Number(divRound(n, d));
}

/**
 * The rate implied by two amounts (a statement that shows 12.99 USD charged as 3.988 KD), as a
 * decimal string with up to 6 decimals and no trailing zeros.
 */
export function impliedRate(fromMinor: Minor, from: string, toMinor: Minor, to: string): string {
  if (fromMinor === 0) return '0';
  const fe = currency(from).exp;
  const te = currency(to).exp;
  const scale = 10n ** 6n;
  const n = BigInt(Math.abs(toMinor)) * 10n ** BigInt(fe) * scale;
  const d = BigInt(Math.abs(fromMinor)) * 10n ** BigInt(te);
  const q = divRound(n, d);
  const s = q.toString().padStart(7, '0');
  const out = `${s.slice(0, -6)}.${s.slice(-6)}`.replace(/\.?0+$/, '');
  return out || '0';
}

/** True when the string is a usable positive rate. */
export function isRate(input: string): boolean {
  return parseRate(input) !== null;
}
