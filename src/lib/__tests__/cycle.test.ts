import { describe, expect, it } from 'vitest';
import { cycleSummary, paydays, salaryAccounts, salaryDue, salaryPaid } from '../calc/cycle';
import type { Salary } from '../model';
import { data, rec, savings, spending, txn } from './fixtures';

const salary: Salary = { active: true, amount: 200_000, fromAccountId: 'sav', toAccountId: 'cur', autoPost: true, startedOn: '2026-09-01' };

describe('paydays', () => {
  it('lists cycle starts from the salary start', () => {
    expect(paydays(salary, 1, '2026-08-01', '2026-11-08')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
  });
  it('follows a mid-month payday', () => {
    expect(paydays({ ...salary, startedOn: '2026-09-25' }, 25, '2026-10-01', '2026-12-31')).toEqual(['2026-10-25', '2026-11-25', '2026-12-25']);
  });
  it('posts the salaries that have fallen due', () => {
    const d = data({ accounts: [savings, spending], salary });
    expect(salaryDue(d, '2026-11-08')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(salaryDue({ ...d, salary: { ...salary, lastPostedOn: '2026-10-01' } }, '2026-11-08')).toEqual(['2026-11-01']);
    expect(salaryDue({ ...d, salary: { ...salary, autoPost: false } }, '2026-11-08')).toEqual([]);
  });
  it('knows when this month is paid, automatically or by hand', () => {
    const d = data({ accounts: [savings, spending], salary });
    expect(salaryPaid(d, '2026-11-08')).toBe(false);
    expect(salaryPaid({ ...d, salary: { ...salary, lastPostedOn: '2026-11-01' } }, '2026-11-08')).toBe(true);
    const manual = txn({ date: '2026-11-02', amount: 200_000, kind: 'transfer', accountId: 'sav', toAccountId: 'cur' });
    expect(salaryPaid({ ...d, txns: [manual] }, '2026-11-08')).toBe(true);
  });
  it('treats every non-savings account as spending when none is marked', () => {
    const other = { ...spending, role: 'other' as const };
    expect(salaryAccounts(data({ accounts: [savings, other] })).map((a) => a.id)).toEqual(['cur']);
  });
});

describe('this month', () => {
  const base = data({
    accounts: [savings, spending],
    salary: { ...salary, lastPostedOn: '2026-11-01' },
    txns: [
      txn({ date: '2026-11-02', amount: 30_000 }),
      txn({ date: '2026-11-05', amount: 20_000 }),
      txn({ date: '2026-11-06', amount: 5_000, kind: 'income', categoryId: 'refunds' }),
      txn({ date: '2026-11-06', amount: 9_000, accountId: 'sav' }), // from savings: not the salary's
      txn({ date: '2026-10-30', amount: 99_000 }), // last month
    ],
  });

  it('measures the salary against spending so far', () => {
    const s = cycleSummary(base, '2026-11-10');
    expect(s.source).toBe('salary');
    expect(s.allowance).toBe(200_000);
    expect(s.spent).toBe(50_000);
    expect(s.extra).toBe(5_000);
    expect(s.left).toBe(155_000);
    expect(s.daysGone).toBe(10);
    expect(s.daysLeft).toBe(21);
  });

  it('keeps bills still to come out of safe-to-spend', () => {
    const d = { ...base, recurring: [rec({ amount: 10_500, startOn: '2026-01-20' }), rec({ amount: 7_000, startOn: '2026-01-03' })] };
    const s = cycleSummary(d, '2026-11-10');
    expect(s.billsAhead).toBe(10_500);
    expect(s.safe).toBe(144_500);
    expect(s.perDay).toBe(Math.floor(144_500 / 21));
  });

  it('keeps fixed bills out of the everyday pace', () => {
    const r = rec({ id: 'gym', amount: 30_000, startOn: '2026-01-02', autoPost: true, lastPostedOn: '2026-11-02' });
    const posted = txn({ date: '2026-11-02', amount: 30_000, recurringId: 'gym' });
    const s = cycleSummary({ ...base, recurring: [r], txns: [...base.txns, posted] }, '2026-11-10');
    // Everyday spending 50 KD against an even pace through 175 KD (205 minus the 30 KD bill).
    expect(s.pace).toBe(50_000 - 58_333);
    expect(s.spent).toBe(80_000);
  });

  it('does not count a bill already posted today', () => {
    const r = rec({ id: 'gym', amount: 10_000, startOn: '2026-01-10', autoPost: true, lastPostedOn: '2026-11-10' });
    const posted = txn({ date: '2026-11-10', amount: 10_000, recurringId: 'gym' });
    const s = cycleSummary({ ...base, recurring: [r], txns: [...base.txns, posted] }, '2026-11-10');
    expect(s.billsAhead).toBe(0);
  });

  it('tracks pace against an even month', () => {
    const s = cycleSummary(base, '2026-11-10');
    // 10 of 30 days gone: an even pace through 205 KD (salary plus the refund) is 68.333 KD.
    expect(s.pace).toBe(50_000 - 68_333);
  });

  it('draws what is left after each day', () => {
    const s = cycleSummary(base, '2026-11-03');
    expect(s.actual.map((p) => p.value)).toEqual([200_000, 170_000, 170_000]);
  });

  it('projects the month end at the current pace and warns when it runs out', () => {
    const heavy = { ...base, txns: [txn({ date: '2026-11-01', amount: 100_000 }), txn({ date: '2026-11-02', amount: 60_000 })] };
    const s = cycleSummary(heavy, '2026-11-04');
    expect(s.projectedEnd).toBeLessThan(0);
    expect(s.runsOutOn).toBe('2026-11-05');
  });

  it('uses budgets as the allowance when there is no salary', () => {
    const d = data({ accounts: [spending], budgets: [{ categoryId: 'coffee', amount: 15_000, rollover: false, since: '2026-11-01' }] });
    expect(cycleSummary(d, '2026-11-10')).toMatchObject({ source: 'budgets', allowance: 15_000 });
    expect(cycleSummary(data(), '2026-11-10')).toMatchObject({ source: 'none', allowance: 0, pace: 0 });
  });
});
