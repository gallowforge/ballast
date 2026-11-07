import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../quick-add';
import { data } from './fixtures';

const d = data({ rules: [{ id: 'r', match: 'BLUE DOOR', categoryId: 'eating-out', payee: 'Blue Door', createdAt: 0 }] });
const q = (s: string) => parseQuickAdd(s, d, '2026-11-08');

describe('quick add', () => {
  it('reads an amount and a merchant', () => {
    expect(q('3.750 talabat')).toEqual({ amount: 3750, kind: 'expense', payee: 'Talabat', categoryId: 'delivery', date: '2026-11-08', currency: undefined });
  });
  it('accepts the words first', () => expect(q('coffee 1.5')).toMatchObject({ amount: 1500, categoryId: 'coffee', payee: 'Coffee' }));
  it('reads money in', () => expect(q('+250 freelance')).toMatchObject({ amount: 250_000, kind: 'income', categoryId: 'freelance' }));
  it('reads another currency', () => {
    expect(q('12.99 usd amazon')).toMatchObject({ amount: 1299, currency: 'USD', categoryId: 'shopping' });
    expect(q('12.99usd amazon')).toMatchObject({ amount: 1299, currency: 'USD' });
  });
  it.each([
    ['5 fuel yesterday', '2026-11-07'],
    ['5 fuel fri', '2026-11-06'],
    ['5 fuel sunday', '2026-11-08'],
    ['5 fuel today', '2026-11-08'],
  ])('reads the day in %j', (s, date) => expect(q(s)!.date).toBe(date));
  it('uses your rules', () => expect(q('8 blue door')).toMatchObject({ payee: 'Blue Door', categoryId: 'eating-out' }));
  it('ignores a KD label and rounds extra decimals', () => {
    expect(q('2.5 kd snacks')).toMatchObject({ amount: 2500, payee: 'Snacks' });
    expect(q('1.23456 x')!.amount).toBe(1235);
  });
  it.each(['', 'coffee', '0 coffee', '-'])('returns nothing for %j', (s) => expect(q(s)).toBeNull());
});
