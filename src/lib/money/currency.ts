/**
 * ISO 4217 currencies Ledger knows, with their minor-unit exponent. Amounts are always stored as
 * integers of the minor unit (fils for the Kuwaiti dinar: 1 KD = 1,000 fils), never as floats.
 */
export interface Currency {
  code: string;
  /** Digits after the decimal point: 3 for KWD, 2 for USD, 0 for JPY. */
  exp: number;
  name: string;
  /** Short label shown after amounts. KD is the local convention for KWD. */
  label: string;
}

const LIST: Currency[] = [
  { code: 'KWD', exp: 3, name: 'Kuwaiti dinar', label: 'KD' },
  { code: 'USD', exp: 2, name: 'US dollar', label: 'USD' },
  { code: 'EUR', exp: 2, name: 'Euro', label: 'EUR' },
  { code: 'GBP', exp: 2, name: 'British pound', label: 'GBP' },
  { code: 'SAR', exp: 2, name: 'Saudi riyal', label: 'SAR' },
  { code: 'AED', exp: 2, name: 'UAE dirham', label: 'AED' },
  { code: 'QAR', exp: 2, name: 'Qatari riyal', label: 'QAR' },
  { code: 'BHD', exp: 3, name: 'Bahraini dinar', label: 'BHD' },
  { code: 'OMR', exp: 3, name: 'Omani rial', label: 'OMR' },
  { code: 'JOD', exp: 3, name: 'Jordanian dinar', label: 'JOD' },
  { code: 'EGP', exp: 2, name: 'Egyptian pound', label: 'EGP' },
  { code: 'TRY', exp: 2, name: 'Turkish lira', label: 'TRY' },
  { code: 'INR', exp: 2, name: 'Indian rupee', label: 'INR' },
  { code: 'PKR', exp: 2, name: 'Pakistani rupee', label: 'PKR' },
  { code: 'PHP', exp: 2, name: 'Philippine peso', label: 'PHP' },
  { code: 'CHF', exp: 2, name: 'Swiss franc', label: 'CHF' },
  { code: 'CAD', exp: 2, name: 'Canadian dollar', label: 'CAD' },
  { code: 'AUD', exp: 2, name: 'Australian dollar', label: 'AUD' },
  { code: 'CNY', exp: 2, name: 'Chinese yuan', label: 'CNY' },
  { code: 'SGD', exp: 2, name: 'Singapore dollar', label: 'SGD' },
  { code: 'MYR', exp: 2, name: 'Malaysian ringgit', label: 'MYR' },
  { code: 'THB', exp: 2, name: 'Thai baht', label: 'THB' },
  { code: 'JPY', exp: 0, name: 'Japanese yen', label: 'JPY' },
  { code: 'KRW', exp: 0, name: 'South Korean won', label: 'KRW' },
];

export const CURRENCIES: readonly Currency[] = LIST;
const BY_CODE = new Map(LIST.map((c) => [c.code, c]));

export function isCurrency(code: string): boolean {
  return BY_CODE.has(code);
}

/** The currency for a code. Unknown codes fall back to two decimals so nothing crashes. */
export function currency(code: string): Currency {
  return BY_CODE.get(code) ?? { code, exp: 2, name: code, label: code };
}

export function exponent(code: string): number {
  return currency(code).exp;
}
