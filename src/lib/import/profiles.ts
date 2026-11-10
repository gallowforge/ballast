import { isCurrency } from '../money/currency';
import type { DateOrder } from './values';

/** A bank whose statements Ballast recognises by name, or any other bank. */
export interface Profile {
  id: 'nbk' | 'generic';
  name: string;
  /** The usual account currency for this bank's statements, when there is one. */
  currency?: string;
  dateOrder: DateOrder;
}

export const NBK: Profile = {
  id: 'nbk',
  name: 'National Bank of Kuwait',
  currency: 'KWD',
  dateOrder: 'dmy',
};
export const GENERIC: Profile = {
  id: 'generic',
  name: 'Bank statement',
  dateOrder: 'dmy',
};

/** Recognises the bank from the statement's own words. */
export function detectProfile(text: string): Profile {
  if (/national bank of kuwait|\bnbk\b|nbk\.com/i.test(text)) return NBK;
  return GENERIC;
}

/**
 * The statement currency when the text names one ("Currency: EUR", "Account currency USD"),
 * else `fallback` (which may be undefined: the importer then uses your main currency).
 */
export function detectCurrency(text: string, fallback?: string): string | undefined {
  const m = /\b(?:currency|ccy)\b[\s:]*([A-Z]{3})\b/i.exec(text);
  const code = m?.[1]!.toUpperCase();
  return code && isCurrency(code) ? code : fallback;
}
