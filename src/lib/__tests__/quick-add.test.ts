import { describe, expect, it } from 'vitest';
import { emptyData } from '../defaults';
import { parseQuickAdd } from '../quick-add';
import { data } from './fixtures';

const d = data({
  rules: [
    { id: 'r', match: 'BLUE DOOR', categoryId: 'eating-out', payee: 'Blue Door', createdAt: 0 },
  ],
});
const q = (s: string, on = d) => parseQuickAdd(s, on, '2026-11-08');
const inBase = (base: string) => data({ settings: { ...emptyData(base).settings } });

describe('quick add', () => {
  it('reads an amount and a merchant', () => {
    expect(q('4.50 uber eats')).toEqual({
      amount: 450,
      kind: 'expense',
      payee: 'Uber Eats',
      categoryId: 'delivery',
      date: '2026-11-08',
      currency: undefined,
    });
  });
  it('accepts the words first', () =>
    expect(q('coffee 1.5')).toMatchObject({ amount: 150, categoryId: 'coffee', payee: 'Coffee' }));
  it('reads money in', () =>
    expect(q('+250 freelance')).toMatchObject({
      amount: 25_000,
      kind: 'income',
      categoryId: 'freelance',
    }));
  it('reads another currency by code, symbol or word', () => {
    expect(q('12.99 eur amazon')).toMatchObject({
      amount: 1299,
      currency: 'EUR',
      categoryId: 'shopping',
    });
    expect(q('12.99eur amazon')).toMatchObject({ amount: 1299, currency: 'EUR' });
    expect(q('€12.99 amazon')).toMatchObject({ amount: 1299, currency: 'EUR' });
    expect(q('8£ lunch')).toMatchObject({ amount: 800, currency: 'GBP' });
    expect(q('30 euros museum')).toMatchObject({ amount: 3000, currency: 'EUR', payee: 'Museum' });
    expect(q('1500 yen ramen')).toMatchObject({ amount: 1500, currency: 'JPY' });
  });
  it('reads "$" as the main currency when it is a dollar, and US dollars otherwise', () => {
    expect(q('$4.50 coffee')).toMatchObject({ amount: 450, currency: undefined });
    expect(q('$4.50 coffee', inBase('CAD'))).toMatchObject({ amount: 450, currency: undefined });
    expect(q('$4.50 coffee', inBase('EUR'))).toMatchObject({ amount: 450, currency: 'USD' });
  });
  it('reads a symbol written apart from the amount', () => {
    expect(q('€ 12 lunch')).toMatchObject({ amount: 1200, currency: 'EUR', payee: 'Lunch' });
    expect(q('$ 3.5 snacks', inBase('AUD'))).toMatchObject({
      amount: 350,
      currency: undefined,
      payee: 'Snacks',
    });
    // A word that is not a currency stays a word: only symbols and ISO codes name one.
    expect(q('3.5 xx snacks')).toMatchObject({ amount: 350, payee: 'Xx Snacks' });
  });
  it('drops a word naming the main currency', () => {
    expect(q('2.5 usd snacks')).toMatchObject({
      amount: 250,
      payee: 'Snacks',
      currency: undefined,
    });
    expect(q('2.5 jod snacks', inBase('JOD'))).toMatchObject({ amount: 2500, payee: 'Snacks' });
  });
  it('keeps letters stuck to a number that are not a currency as words', () =>
    expect(q('15 lunch 2pm')).toMatchObject({ amount: 1500, payee: 'Lunch 2pm' }));
  it.each([
    ['5 fuel yesterday', '2026-11-07'],
    ['5 fuel fri', '2026-11-06'],
    ['5 fuel sunday', '2026-11-08'],
    ['5 fuel today', '2026-11-08'],
  ])('reads the day in %j', (s, date) => expect(q(s)!.date).toBe(date));
  it('uses your rules', () =>
    expect(q('8 blue door')).toMatchObject({ payee: 'Blue Door', categoryId: 'eating-out' }));
  it('rounds extra decimals to the currency', () => {
    expect(q('1.23456 x')!.amount).toBe(123);
    expect(q('1.23456 x', inBase('OMR'))!.amount).toBe(1235);
  });
  it('leaves out a category this money life does not have', () => {
    const without = data({ categories: emptyData().categories.filter((c) => c.id !== 'home') });
    expect(q('1350 rent')!.categoryId).toBe('home');
    expect(q('1350 rent', without)!.categoryId).toBeUndefined();
  });
  it.each(['', 'coffee', '0 coffee', '-'])('returns nothing for %j', (s) =>
    expect(q(s)).toBeNull(),
  );
});
