/**
 * ISO 4217 currencies Ballast knows, with their minor-unit exponent. Amounts are always stored as
 * integers of the minor unit (cents for the dollar, thousandths for the three-decimal dinars and
 * rials, whole units for the yen), never as floats.
 */
export interface Currency {
  code: string;
  /** Digits after the decimal point: 2 for USD, 3 for the dinars, 0 for JPY. */
  exp: number;
  name: string;
  /** Short label shown after amounts: the ISO code. */
  label: string;
}

// The three most used first, then by code, so typing a letter in a picker finds the rest.
const LIST: Currency[] = (
  [
    ['USD', 2, 'US dollar'],
    ['EUR', 2, 'Euro'],
    ['GBP', 2, 'British pound'],
    ['AED', 2, 'UAE dirham'],
    ['AUD', 2, 'Australian dollar'],
    ['BHD', 3, 'Bahraini dinar'],
    ['BRL', 2, 'Brazilian real'],
    ['CAD', 2, 'Canadian dollar'],
    ['CHF', 2, 'Swiss franc'],
    ['CNY', 2, 'Chinese yuan'],
    ['COP', 2, 'Colombian peso'],
    ['CZK', 2, 'Czech koruna'],
    ['DKK', 2, 'Danish krone'],
    ['EGP', 2, 'Egyptian pound'],
    ['HKD', 2, 'Hong Kong dollar'],
    ['HUF', 2, 'Hungarian forint'],
    ['IDR', 2, 'Indonesian rupiah'],
    ['INR', 2, 'Indian rupee'],
    ['JOD', 3, 'Jordanian dinar'],
    ['JPY', 0, 'Japanese yen'],
    ['KRW', 0, 'South Korean won'],
    ['KWD', 3, 'Kuwaiti dinar'],
    ['MXN', 2, 'Mexican peso'],
    ['MYR', 2, 'Malaysian ringgit'],
    ['NGN', 2, 'Nigerian naira'],
    ['NOK', 2, 'Norwegian krone'],
    ['NZD', 2, 'New Zealand dollar'],
    ['OMR', 3, 'Omani rial'],
    ['PHP', 2, 'Philippine peso'],
    ['PKR', 2, 'Pakistani rupee'],
    ['PLN', 2, 'Polish zloty'],
    ['QAR', 2, 'Qatari riyal'],
    ['SAR', 2, 'Saudi riyal'],
    ['SEK', 2, 'Swedish krona'],
    ['SGD', 2, 'Singapore dollar'],
    ['THB', 2, 'Thai baht'],
    ['TRY', 2, 'Turkish lira'],
    ['TWD', 2, 'New Taiwan dollar'],
    ['VND', 0, 'Vietnamese dong'],
    ['ZAR', 2, 'South African rand'],
  ] as const
).map(([code, exp, name]) => ({ code, exp, name, label: code }));

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
