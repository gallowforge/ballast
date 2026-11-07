import type { DateOrder } from './values';

export interface Profile {
  id: 'nbk' | 'generic';
  name: string;
  currency: string;
  dateOrder: DateOrder;
}

export const NBK: Profile = { id: 'nbk', name: 'National Bank of Kuwait', currency: 'KWD', dateOrder: 'dmy' };
export const GENERIC: Profile = { id: 'generic', name: 'Bank statement', currency: 'KWD', dateOrder: 'dmy' };

/** Recognises the bank from the statement's own words. */
export function detectProfile(text: string): Profile {
  if (/national bank of kuwait|\bnbk\b|nbk\.com/i.test(text)) return NBK;
  return GENERIC;
}

/** The statement currency when the text names one ("Currency: KWD", "Account currency USD"). */
export function detectCurrency(text: string, fallback: string): string {
  const m = /\b(?:currency|ccy)\b[\s:]*([A-Z]{3})\b/i.exec(text);
  return m ? m[1]!.toUpperCase() : fallback;
}
