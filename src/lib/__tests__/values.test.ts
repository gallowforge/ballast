import { describe, expect, it } from 'vitest';
import {
  detectDateOrder,
  detectDecimal,
  looksLikeAmount,
  looksLikeDate,
  parseAmount,
  parseDate,
} from '../import/values';

describe('statement dates', () => {
  it.each([
    ['08/11/2026', 'dmy', '2026-11-08'],
    ['8-11-26', 'dmy', '2026-11-08'],
    ['08.11.2026', 'dmy', '2026-11-08'],
    ['11/08/2026', 'mdy', '2026-11-08'],
    ['2026-11-08', 'dmy', '2026-11-08'],
    ['2026/11/08', 'mdy', '2026-11-08'],
    ['08 Nov 2026', 'dmy', '2026-11-08'],
    ['08-NOV-2026', 'dmy', '2026-11-08'],
    ['08NOV26', 'dmy', '2026-11-08'],
    ['8 November 2026', 'dmy', '2026-11-08'],
    ['Nov 8, 2026', 'dmy', '2026-11-08'],
    ['08/11/2026 14:32', 'dmy', '2026-11-08'],
    ['08/11/2026 2:32 PM', 'dmy', '2026-11-08'],
  ] as const)('%s (%s) → %s', (raw, order, out) => expect(parseDate(raw, order)).toBe(out));
  it.each(['31/02/2026', '2026-13-01', 'yesterday', '', '12.500', '1234', '08/11'])(
    'rejects %j',
    (raw) => expect(parseDate(raw)).toBeNull(),
  );
  it('detects day-first, month-first and ISO columns', () => {
    expect(detectDateOrder(['01/11/2026', '25/11/2026'])).toBe('dmy');
    expect(detectDateOrder(['11/01/2026', '11/25/2026'])).toBe('mdy');
    expect(detectDateOrder(['01/02/2026', '03/04/2026'])).toBe('dmy');
    expect(detectDateOrder(['2026-11-01'])).toBe('ymd');
  });
  it('tells dates from other text', () => {
    expect(looksLikeDate('08-Nov-2026')).toBe(true);
    expect(looksLikeDate('POS 1234')).toBe(false);
  });
});

describe('statement amounts', () => {
  it.each([
    ['1,234.567', 3, '.', 1234567, false],
    ['12.5', 3, '.', 12500, false],
    ['-12.500', 3, '.', -12500, true],
    ['12.500-', 3, '.', -12500, true],
    ['(12.500)', 3, '.', -12500, true],
    ['12.500 DR', 3, '.', -12500, true],
    ['12.500 CR', 3, '.', 12500, true],
    ['12.500Cr', 3, '.', 12500, true],
    ['USD 12.50', 2, '.', 1250, false],
    ['12.50 EUR', 2, '.', 1250, false],
    ['JOD 12.500', 3, '.', 12500, false],
    ['$1,234.56', 2, '.', 123456, false],
    ['-$12.50', 2, '.', -1250, true],
    ['(£12.50)', 2, '.', -1250, true],
    ['€1.234,56', 2, ',', 123456, false],
    ['1.234,56', 2, ',', 123456, false],
    ['-1 234,56', 2, ',', -123456, true],
    ['+7.25', 2, '.', 725, true],
    ['0.0005', 3, '.', 1, false],
    ['0.0004', 3, '.', 0, false],
    ['.75', 2, '.', 75, false],
  ] as const)('%s → %i', (raw, exp, dec, minor, signed) =>
    expect(parseAmount(raw, exp, dec)).toEqual({ minor, signed }),
  );
  it.each(['', '-', '—', 'abc', 'N/A'])('rejects %j', (raw) =>
    expect(parseAmount(raw, 3)).toBeNull(),
  );
  it('detects comma decimals', () => {
    expect(detectDecimal(['1.234,56', '12,50', '3,00'])).toBe(',');
    expect(detectDecimal(['1,234.567', '12.500'])).toBe('.');
    expect(detectDecimal([])).toBe('.');
  });
  it('tells amounts from dates and words', () => {
    expect(looksLikeAmount('1,234.567')).toBe(true);
    expect(looksLikeAmount('(12.500)')).toBe(true);
    expect(looksLikeAmount('12.500 CR')).toBe(true);
    expect(looksLikeAmount('08/11/2026')).toBe(false);
    expect(looksLikeAmount('DELIVEROO')).toBe(false);
    expect(looksLikeAmount('-$12.50')).toBe(true);
    expect(looksLikeAmount('€1.234,56')).toBe(true);
    expect(looksLikeAmount('$')).toBe(false);
    expect(looksLikeAmount('')).toBe(false);
  });
});
