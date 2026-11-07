import { describe, expect, it } from 'vitest';
import { currency, exponent, isCurrency } from '../money/currency';
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
  it('knows the dinar has three decimals and the label KD', () => {
    expect(currency('KWD')).toMatchObject({ exp: 3, label: 'KD' });
  });
  it.each([
    ['USD', 2],
    ['BHD', 3],
    ['JPY', 0],
    ['EUR', 2],
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
  it('accepts a positive amount in the currency', () => expect(parseAmountInput('4.750', 'KWD')).toBe(4750));
  it.each(['0', '-1', '0.000', 'x', '1.234', ''])('rejects %j for USD', (s) => expect(parseAmountInput(s, 'USD')).toBeNull());
});

describe('formatting', () => {
  it.each([
    [1234500, 3, '1,234.500'],
    [5, 3, '0.005'],
    [-250, 3, '−0.250'],
    [0, 3, '0.000'],
    [123456789, 2, '1,234,567.89'],
    [42, 0, '42'],
  ])('%i fils at %i decimals → %s', (minor, exp, out) => expect(formatMinor(minor, exp)).toBe(out));
  it('can show a plus sign, drop signs, or skip grouping', () => {
    expect(formatMinor(1500, 3, { sign: 'always' })).toBe('+1.500');
    expect(formatMinor(0, 3, { sign: 'always' })).toBe('0.000');
    expect(formatMinor(-1500, 3, { sign: 'never' })).toBe('1.500');
    expect(formatMinor(1234500, 3, { group: false })).toBe('1234.500');
  });
  it('labels dinars as KD', () => expect(formatMoney(12500, 'KWD')).toBe('12.500 KD'));
  it('splits an amount for typography', () => {
    expect(moneyParts(-1234567, 'KWD')).toEqual({ sign: '−', whole: '1,234', fraction: '567', unit: 'KD' });
    expect(moneyParts(500, 'JPY')).toEqual({ sign: '', whole: '500', fraction: '', unit: 'JPY' });
  });
  it.each([
    [950_000, '950'],
    [1_200_000, '1.2k'],
    [14_000_000, '14k'],
    [250_000_000, '250k'],
    [1_500_000_000, '1.5M'],
    [-2_500_000, '−2.5k'],
  ])('compacts %i fils to %s', (minor, out) => expect(formatCompact(minor, 'KWD')).toBe(out));
  it('rounds headlines to whole units', () => {
    expect(formatRounded(1234500, 'KWD')).toBe('1,235 KD');
    expect(formatRounded(-1500, 'KWD')).toBe('−2 KD');
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
  it('converts dollars to dinars with half-up rounding', () => {
    // 12.99 USD × 0.30705 = 3.9885795 KD → 3.989 KD
    expect(convert(1299, 'USD', 'KWD', '0.30705')).toBe(3989);
  });
  it('converts dinars to yen across exponents', () => {
    expect(convert(1000, 'KWD', 'JPY', '490.5')).toBe(491);
  });
  it('keeps negative amounts symmetric', () => expect(convert(-1299, 'USD', 'KWD', '0.30705')).toBe(-3989));
  it('is the identity for the same currency', () => expect(convert(123, 'KWD', 'KWD', 'x')).toBe(123));
  it('returns null for a bad rate', () => expect(convert(100, 'USD', 'KWD', '')).toBeNull());
  it('works out the rate a statement implies', () => {
    expect(impliedRate(1299, 'USD', 3989, 'KWD')).toBe('0.307082');
    expect(impliedRate(10000, 'USD', 30705, 'KWD')).toBe('0.30705');
    expect(impliedRate(0, 'USD', 10, 'KWD')).toBe('0');
  });
});
