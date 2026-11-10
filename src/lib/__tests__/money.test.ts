import { describe, expect, it } from 'vitest';
import { CURRENCIES, currency, exponent, isCurrency } from '../money/currency';
import { convert, impliedRate, isRate, parseRate } from '../money/fx';
import {
  floorTo,
  formatCompact,
  formatMinor,
  formatMoney,
  formatRounded,
  moneyParts,
  parseAmountInput,
  parseMinor,
  share,
  sum,
} from '../money/money';

describe('currencies', () => {
  it('labels every currency with its ISO code, the most used first', () => {
    expect(CURRENCIES.slice(0, 3).map((c) => c.code)).toEqual(['USD', 'EUR', 'GBP']);
    expect(CURRENCIES).toHaveLength(40);
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.label).toBe(c.code);
      expect([0, 2, 3]).toContain(c.exp);
    }
  });
  it.each([
    ['USD', 2],
    ['EUR', 2],
    ['KWD', 3],
    ['BHD', 3],
    ['JPY', 0],
    ['VND', 0],
  ])('%s has %i decimals', (code, exp) => expect(exponent(code)).toBe(exp));
  it('falls back to two decimals for an unknown code', () => {
    expect(currency('XYZ')).toMatchObject({ code: 'XYZ', exp: 2 });
    expect(isCurrency('XYZ')).toBe(false);
  });
});

describe('parseMinor', () => {
  it.each([
    ['1', 3, 1000],
    ['1.5', 3, 1500],
    ['1.250', 3, 1250],
    ['0.005', 3, 5],
    ['.5', 3, 500],
    ['1,234.567', 3, 1234567],
    ['-2.25', 2, -225],
    ['+7', 2, 700],
    ['12', 0, 12],
    ['  3.1  ', 2, 310],
  ])('%s with %i decimals → %i', (input, exp, out) => expect(parseMinor(input, exp)).toBe(out));
  it.each(['', '.', 'abc', '1.2.3', '1.2345', '1e3', '--1'])('rejects %j', (input) =>
    expect(parseMinor(input, 3)).toBeNull(),
  );
  it('never goes through floating point (0.1 + 0.2 territory)', () => {
    expect(parseMinor('0.1', 3)! + parseMinor('0.2', 3)!).toBe(parseMinor('0.3', 3));
  });
});

describe('parseAmountInput', () => {
  it('accepts a positive amount in the currency', () => {
    expect(parseAmountInput('4.50', 'USD')).toBe(450);
    expect(parseAmountInput('4.750', 'KWD')).toBe(4750);
  });
  it.each(['0', '-1', '0.000', 'x', '1.234', ''])('rejects %j for USD', (s) =>
    expect(parseAmountInput(s, 'USD')).toBeNull(),
  );
});

describe('formatting', () => {
  it.each([
    [1234500, 3, '1,234.500'],
    [5, 3, '0.005'],
    [-250, 3, '−0.250'],
    [0, 3, '0.000'],
    [123456789, 2, '1,234,567.89'],
    [42, 0, '42'],
  ])('%i minor units at %i decimals → %s', (minor, exp, out) =>
    expect(formatMinor(minor, exp)).toBe(out),
  );
  it('can show a plus sign, drop signs, or skip grouping', () => {
    expect(formatMinor(1500, 3, { sign: 'always' })).toBe('+1.500');
    expect(formatMinor(0, 3, { sign: 'always' })).toBe('0.000');
    expect(formatMinor(-1500, 3, { sign: 'never' })).toBe('1.500');
    expect(formatMinor(1234500, 3, { group: false })).toBe('1234.500');
  });
  it('labels amounts with the currency code', () => {
    expect(formatMoney(1250, 'USD')).toBe('12.50 USD');
    expect(formatMoney(12500, 'KWD')).toBe('12.500 KWD');
  });
  it('splits an amount for typography', () => {
    expect(moneyParts(-123456, 'EUR')).toEqual({
      sign: '−',
      whole: '1,234',
      fraction: '56',
      unit: 'EUR',
    });
    expect(moneyParts(1234567, 'OMR')).toMatchObject({ whole: '1,234', fraction: '567' });
    expect(moneyParts(500, 'JPY')).toEqual({ sign: '', whole: '500', fraction: '', unit: 'JPY' });
  });
  it.each([
    [95_000, '950'],
    [120_000, '1.2k'],
    [1_400_000, '14k'],
    [25_000_000, '250k'],
    [150_000_000, '1.5M'],
    [-250_000, '−2.5k'],
  ])('compacts %i cents to %s', (minor, out) => expect(formatCompact(minor, 'USD')).toBe(out));
  it('compacts by the currency’s own decimals', () => {
    expect(formatCompact(1_200_000, 'KWD')).toBe('1.2k');
    expect(formatCompact(1_200, 'JPY')).toBe('1.2k');
  });
  it('rounds headlines to whole units', () => {
    expect(formatRounded(123450, 'USD')).toBe('1,235 USD');
    expect(formatRounded(-150, 'USD')).toBe('−2 USD');
    expect(formatRounded(1234500, 'KWD')).toBe('1,235 KWD');
  });
});

describe('arithmetic helpers', () => {
  it('sums', () => expect(sum([1, 2, 3])).toBe(6));
  it('shares by flooring so it never overspends', () => {
    expect(share(1000, 3)).toBe(333);
    expect(share(1000, 0)).toBe(0);
  });
  it('floors to a step', () => {
    expect(floorTo(256_950, 1000)).toBe(256_000);
    expect(floorTo(-1_500, 1000)).toBe(-1_000);
    expect(floorTo(1_234, 1)).toBe(1_234);
  });
});

describe('exchange rates', () => {
  it('parses decimal rates exactly', () => {
    expect(parseRate('0.30705')).toEqual({ num: 30705n, den: 100000n });
    expect(parseRate('3')).toEqual({ num: 3n, den: 1n });
    expect(isRate('0')).toBe(false);
    expect(isRate('-1')).toBe(false);
    expect(isRate('abc')).toBe(false);
  });
  it('converts euros to dollars with half-up rounding', () => {
    // 12.99 EUR × 1.0855 = 14.100645 USD → 14.10 USD
    expect(convert(1299, 'EUR', 'USD', '1.0855')).toBe(1410);
  });
  it('converts across exponents, to three decimals and to none', () => {
    // 12.99 USD × 0.30705 = 3.9885795 KWD → 3.989 KWD
    expect(convert(1299, 'USD', 'KWD', '0.30705')).toBe(3989);
    expect(convert(1000, 'KWD', 'JPY', '490.5')).toBe(491);
  });
  it('keeps negative amounts symmetric', () =>
    expect(convert(-1299, 'EUR', 'USD', '1.0855')).toBe(-1410));
  it('is the identity for the same currency', () =>
    expect(convert(123, 'USD', 'USD', 'x')).toBe(123));
  it('returns null for a bad rate', () => expect(convert(100, 'EUR', 'USD', '')).toBeNull());
  it('works out the rate a statement implies', () => {
    expect(impliedRate(1299, 'EUR', 1410, 'USD')).toBe('1.08545');
    expect(impliedRate(10000, 'EUR', 10855, 'USD')).toBe('1.0855');
    expect(impliedRate(1299, 'USD', 3989, 'KWD')).toBe('0.307082');
    expect(impliedRate(0, 'EUR', 10, 'USD')).toBe('0');
  });
});

describe('grouping marks', () => {
  it('accepts the Arabic thousands separator as a grouping mark', () => {
    expect(parseMinor(`1${String.fromCharCode(0x66c)}234.5`, 3)).toBe(1234500);
  });
});

describe('what people actually type', () => {
  it.each([
    ['1,5', 3, 1500],
    ['12,50', 2, 1250],
    ['1.234,5', 3, 1234500],
    ['1,234,567.5', 3, 1234567500],
    ['1,500', 3, 1500000],
    // A leading zero cannot start a thousands group, so this comma is a decimal point.
    ['0,500', 3, 500],
    ['-0,250', 3, -250],
  ])('%s → %i', (input, exp, out) => expect(parseMinor(input, exp)).toBe(out));
  it('reads Arabic-Indic digits and the Arabic decimal separator', () => {
    const ar = (s: string) =>
      s
        .replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d)))
        .replace('.', String.fromCharCode(0x66b));
    expect(parseMinor(ar('4.750'), 3)).toBe(4750);
  });
  it('still refuses two decimal commas', () => expect(parseMinor('1,2,3', 3)).toBeNull());
});
