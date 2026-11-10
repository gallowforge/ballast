import { describe, expect, it } from 'vitest';
import { describeCycleDay, detectRecurring, insights } from '../calc/insights';
import {
  byCategory,
  byDay,
  byWeekday,
  cashflow,
  cumulative,
  income,
  median,
  spanDays,
  spending,
  topPayees,
} from '../calc/stats';
import { cycleOf } from '../dates';
import { data, rec, spending as cur, txn } from './fixtures';

describe('stats', () => {
  const d = data({
    accounts: [cur],
    txns: [
      txn({ date: '2026-11-01', amount: 3_000, categoryId: 'coffee', payee: 'Starbucks' }),
      txn({ date: '2026-11-01', amount: 2_000, categoryId: 'coffee', payee: 'starbucks' }),
      txn({ date: '2026-11-03', amount: 10_000, categoryId: 'fuel', payee: 'Shell' }),
      txn({ date: '2026-11-03', amount: 1_000, payee: '' }),
      txn({ date: '2026-11-04', amount: 50_000, kind: 'income', categoryId: 'freelance' }),
      txn({ date: '2026-11-04', amount: 99_000, kind: 'transfer', toAccountId: 'cur' }),
    ],
  });
  it('totals spending and income, never transfers', () => {
    expect(spending(d, '2026-11-01', '2026-11-30')).toBe(16_000);
    expect(spending(d, '2026-11-01', '2026-11-30', (t) => t.categoryId === 'coffee')).toBe(5_000);
    expect(income(d, '2026-11-01', '2026-11-30')).toBe(50_000);
    expect(income(d, '2026-11-01', '2026-11-30', (t) => t.categoryId === 'salary')).toBe(0);
  });
  it('groups by category, largest first, uncategorised as ""', () => {
    expect(byCategory(d, '2026-11-01', '2026-11-30')).toEqual([
      { categoryId: 'fuel', total: 10_000, count: 1 },
      { categoryId: 'coffee', total: 5_000, count: 2 },
      { categoryId: '', total: 1_000, count: 1 },
    ]);
    expect(byCategory(d, '2026-11-01', '2026-11-30', 'income')[0]!.categoryId).toBe('freelance');
  });
  it('fills every day, including quiet ones', () => {
    expect([...byDay(d, '2026-11-01', '2026-11-04').values()]).toEqual([5_000, 0, 11_000, 0]);
    expect(cumulative(d, '2026-11-01', '2026-11-04')).toEqual([5_000, 5_000, 16_000, 16_000]);
    expect(spanDays('2026-11-01', '2026-11-04')).toBe(4);
  });
  it('averages by weekday', () => {
    const w = byWeekday(d, '2026-11-01', '2026-11-07');
    expect(w[0]).toBe(5_000); // Sunday 1 November
    expect(w[2]).toBe(11_000);
  });
  it('builds monthly cash flow', () => {
    const [row] = cashflow(d, [cycleOf('2026-11-08', 1)]);
    expect(row).toMatchObject({ income: 50_000, spending: 16_000, net: 34_000 });
  });
  it('ranks payees, merging spellings', () => {
    expect(topPayees(d, '2026-11-01', '2026-11-30', 2)).toEqual([
      { payee: 'Shell', total: 10_000, count: 1, categoryId: 'fuel' },
      { payee: 'Starbucks', total: 5_000, count: 2, categoryId: 'coffee' },
    ]);
  });
  it('takes medians', () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
  });
});

describe('repeating payments', () => {
  const monthly = (payee: string, amounts: number[], start = 1) =>
    amounts.map((amount, i) =>
      txn({
        date: `2026-${String(7 + i).padStart(2, '0')}-${String(start).padStart(2, '0')}`,
        amount,
        payee,
        categoryId: 'subscriptions',
      }),
    );

  it('spots a monthly subscription and its price rise', () => {
    const d = data({ accounts: [cur], txns: monthly('Netflix', [3_000, 3_000, 3_000, 3_500], 15) });
    const [s] = detectRecurring(d, '2026-11-08');
    expect(s).toMatchObject({
      payee: 'Netflix',
      amount: 3_500,
      unit: 'month',
      count: 4,
      previous: 3_000,
      last: '2026-10-15',
    });
  });
  it('ignores places you simply visit often', () => {
    const visits = ['2026-10-01', '2026-10-03', '2026-10-20', '2026-10-21', '2026-11-05'].map(
      (date) => txn({ date, amount: 1_500, payee: 'Starbucks' }),
    );
    expect(detectRecurring(data({ accounts: [cur], txns: visits }), '2026-11-08')).toEqual([]);
  });
  it('ignores payments that stopped', () => {
    expect(
      detectRecurring(
        data({ accounts: [cur], txns: monthly('Old gym', [10_000, 10_000, 10_000]) }),
        '2027-03-01',
      ),
    ).toEqual([]);
  });
  it('ignores what you already track', () => {
    const d = data({
      accounts: [cur],
      txns: monthly('Spotify', [1_990, 1_990, 1_990]),
      recurring: [rec({ name: 'Spotify Premium', amount: 1_990, startOn: '2026-07-01' })],
    });
    expect(detectRecurring(d, '2026-09-20')).toEqual([]);
  });
  it('spots weekly payments too', () => {
    const d = data({
      accounts: [cur],
      txns: ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'].map((date) =>
        txn({ date, amount: 5_000, payee: 'Cleaner' }),
      ),
    });
    expect(detectRecurring(d, '2026-10-28')[0]).toMatchObject({ unit: 'week', payee: 'Cleaner' });
  });
});

describe('insights', () => {
  it('compares this month with the same point last month', () => {
    const d = data({
      accounts: [cur],
      txns: [
        txn({ date: '2026-10-03', amount: 50_000, categoryId: 'shopping' }),
        txn({ date: '2026-11-02', amount: 20_000, categoryId: 'shopping' }),
      ],
    });
    const pace = insights(d, '2026-11-05').find((i) => i.id.startsWith('pace:'))!;
    expect(pace.tone).toBe('good');
    expect(pace.title).toBe('Spending is 60% lower than this point last month');
    expect(pace.body).toBe('200.00 USD so far, against 500.00 USD by day 5 last month.');
  });
  it('names the category that rose most', () => {
    const d = data({
      accounts: [cur],
      txns: [
        txn({ date: '2026-10-02', amount: 10_000, categoryId: 'coffee' }),
        txn({ date: '2026-11-02', amount: 10_000, categoryId: 'coffee' }),
        txn({ date: '2026-11-03', amount: 9_000, categoryId: 'delivery' }),
      ],
    });
    const riser = insights(d, '2026-11-05').find((i) => i.id.startsWith('riser:'))!;
    expect(riser.title).toBe('Food delivery is up 90.00 USD on last month');
  });
  it('warns about a budget that is over', () => {
    const d = data({
      accounts: [cur],
      budgets: [{ categoryId: 'coffee', amount: 5_000, rollover: false, since: '2026-11-01' }],
      txns: [txn({ date: '2026-11-02', amount: 6_250, categoryId: 'coffee' })],
    });
    expect(insights(d, '2026-11-05')[0]).toMatchObject({
      tone: 'warn',
      title: 'Coffee is over budget by 12.50 USD',
    });
  });
  it('offers to track a repeating payment', () => {
    const d = data({
      accounts: [cur],
      txns: [1, 2, 3].map((i) =>
        txn({ date: `2026-${String(7 + i).padStart(2, '0')}-09`, amount: 1_199, payee: 'Spotify' }),
      ),
    });
    const sub = insights(d, '2026-11-05').find((i) => i.id === 'sub:spotify')!;
    expect(sub.action).toMatchObject({ kind: 'track', label: 'Track it' });
  });
  it('totals recurring costs as a year and a share of the salary', () => {
    const d = data({
      accounts: [cur],
      salary: {
        active: true,
        amount: 200_000,
        fromAccountId: 'cur',
        toAccountId: 'cur',
        autoPost: false,
        startedOn: '2026-01-01',
      },
      recurring: [
        rec({ amount: 10_000, startOn: '2026-01-01' }),
        rec({ amount: 120_000, unit: 'year', startOn: '2026-03-01' }),
      ],
    });
    const fixed = insights(d, '2026-11-05').find((i) => i.id.startsWith('fixed:'))!;
    expect(fixed.title).toBe('Your 2 recurring costs add up to 2,400.00 USD a year');
    expect(fixed.body).toBe(
      'That is 200.00 USD a month; the ones paid from your spending account take 10% of your salary.',
    );
  });
  it('says how much of last month was kept', () => {
    const d = data({
      accounts: [cur],
      txns: [
        txn({ date: '2026-10-02', amount: 100_000, kind: 'income' }),
        txn({ date: '2026-10-03', amount: 75_000 }),
      ],
    });
    expect(insights(d, '2026-11-05').find((i) => i.id.startsWith('kept:'))!.title).toBe(
      'You kept 25% of what came in last month',
    );
  });
  it('points out a purchase much bigger than usual', () => {
    const usual = [1, 2, 3, 4, 5].map((i) =>
      txn({ date: `2026-10-0${i}`, amount: 5_000, categoryId: 'shopping', payee: 'Shop' }),
    );
    const d = data({
      accounts: [cur],
      txns: [
        ...usual,
        txn({ date: '2026-11-04', amount: 40_000, categoryId: 'shopping', payee: 'Best Buy' }),
      ],
    });
    expect(insights(d, '2026-11-05').find((i) => i.id.startsWith('big:'))!.title).toBe(
      'Bigger than usual: 400.00 USD at Best Buy',
    );
  });
  it('finds the most expensive weekday over eight weeks', () => {
    const txns = Array.from({ length: 9 }, (_, i) =>
      txn({
        date: `2026-${i < 4 ? '09' : '10'}-${String(i < 4 ? 3 + 7 * i : 1 + 7 * (i - 4)).padStart(2, '0')}`,
        amount: 20_000,
      }),
    );
    const d = data({ accounts: [cur], txns });
    const w = insights(d, '2026-11-05').find((i) => i.id.startsWith('weekday:'));
    expect(w?.title).toMatch(/^Thursdays cost the most/);
  });
  it('asks for categories when several are missing, and respects dismissals', () => {
    const d = data({
      accounts: [cur],
      txns: [1, 2, 3].map((i) => txn({ date: `2026-11-0${i}`, amount: 1_000 })),
    });
    const loose = insights(d, '2026-11-05').find((i) => i.id.startsWith('loose:'))!;
    expect(loose.title).toBe('3 transactions need a category');
    expect(
      insights({ ...d, dismissed: [loose.id] }, '2026-11-05').some((i) => i.id === loose.id),
    ).toBe(false);
  });
  it('stays quiet without enough data', () => {
    expect(insights(data(), '2026-11-05')).toEqual([]);
  });
  it('describes the cycle day', () => {
    expect(describeCycleDay(1)).toBe('on the 1st of each month');
    expect(describeCycleDay(25)).toBe('on the 25th of each month');
  });
});
