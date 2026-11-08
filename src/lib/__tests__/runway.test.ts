import { describe, expect, it } from 'vitest';
import { averageBurn, runway } from '../calc/runway';
import type { LedgerData, Salary } from '../model';
import { data, rec, savings, spending, txn } from './fixtures';

const salary: Salary = {
  active: true,
  amount: 200_000,
  fromAccountId: 'sav',
  toAccountId: 'cur',
  autoPost: true,
  startedOn: '2026-11-01',
  lastPostedOn: '2026-11-01',
};

function plan(p: Partial<LedgerData> = {}) {
  return data({ accounts: [{ ...savings, opening: 1_000_000 }, spending], salary, ...p });
}

describe('runway with a salary from savings', () => {
  it('counts full paydays left and the payday that cannot be paid', () => {
    const r = runway(plan(), '2026-11-10');
    expect(r.mode).toBe('salary');
    expect(r.start).toBe(1_000_000);
    expect(r.periods).toBe(5);
    expect(r.lastFull).toBe('2027-04-01');
    expect(r.runOut).toBe('2027-05-01');
    expect(r.lasts).toBe(false);
  });

  it('draws this month first when it has not been paid yet', () => {
    const r = runway(plan({ salary: { ...salary, lastPostedOn: undefined } }), '2026-11-10');
    expect(r.events[0]).toMatchObject({ date: '2026-11-10', kind: 'salary' });
    expect(r.periods).toBe(5);
    expect(r.lastFull).toBe('2027-03-01');
  });

  it('keeps the floor out of reach', () => {
    const r = runway(
      plan({ target: { date: '2027-12-01', floor: 300_000, label: 'Goal' } }),
      '2026-11-10',
    );
    expect(r.periods).toBe(3);
    expect(r.runOut).toBe('2027-03-01');
  });

  it('never projects below zero', () => {
    const r = runway(plan(), '2026-11-10');
    expect(Math.min(...r.points.map((p) => p.balance))).toBe(0);
  });

  it('adds income into savings and costs taken from savings', () => {
    const r = runway(
      plan({
        recurring: [
          rec({
            id: 'job',
            name: 'Job',
            kind: 'income',
            amount: 150_000,
            accountId: 'sav',
            startOn: '2026-12-15',
          }),
          rec({
            id: 'ins',
            name: 'Insurance',
            amount: 90_000,
            accountId: 'sav',
            unit: 'year',
            startOn: '2027-01-20',
          }),
        ],
      }),
      '2026-11-10',
    );
    expect(r.events.some((e) => e.kind === 'income' && e.label === 'Job')).toBe(true);
    expect(r.events.some((e) => e.kind === 'cost' && e.date === '2027-01-20')).toBe(true);
    expect(r.periods).toBeGreaterThan(5);
  });

  it('lasts forever when income covers the salary', () => {
    const r = runway(
      plan({
        recurring: [
          rec({ kind: 'income', amount: 250_000, accountId: 'sav', startOn: '2026-11-20' }),
        ],
      }),
      '2026-11-10',
    );
    expect(r.lasts).toBe(true);
    expect(r.runOut).toBeNull();
  });

  it('tries a different salary without saving it', () => {
    expect(runway(plan(), '2026-11-10', { salary: 100_000 }).periods).toBe(10);
  });

  it('works out the largest salary that reaches the target', () => {
    const r = runway(
      plan({ target: { date: '2027-11-01', floor: 100_000, label: 'Graduation' } }),
      '2026-11-10',
    );
    const t = r.target!;
    expect(t.periods).toBe(12);
    expect(t.status).toBe('short');
    expect(t.balanceAt).toBe(1_000_000 - 12 * 200_000);
    expect(t.sustainable).toBe(Math.floor(900_000 / 12));
    expect(t.periodsShort).toBe(8);
    const fixed = runway(
      plan({ target: t && { date: t.date, floor: 100_000, label: 'x' } }),
      '2026-11-10',
      { salary: t.sustainable! },
    );
    expect(fixed.target!.status).toBe('reaches');
    expect(fixed.target!.surplus).toBeGreaterThanOrEqual(0);
  });

  it('reports the spare money when the target is reached', () => {
    const r = runway(
      plan({ target: { date: '2027-02-01', floor: 0, label: 'Soon' } }),
      '2026-11-10',
    );
    expect(r.target).toMatchObject({
      status: 'reaches',
      periods: 3,
      surplus: 400_000,
      periodsShort: 0,
    });
  });

  it('can try another target date', () => {
    const r = runway(
      plan({ target: { date: '2027-02-01', floor: 0, label: 'Soon' } }),
      '2026-11-10',
      { targetDate: '2027-06-01' },
    );
    expect(r.target!.date).toBe('2027-06-01');
    expect(r.target!.status).toBe('short');
  });

  it('shows enough of the future to tell the story', () => {
    const r = runway(
      plan({ target: { date: '2028-06-01', floor: 0, label: 'Far' } }),
      '2026-11-10',
    );
    expect(r.horizon >= '2028-08-01').toBe(true);
    expect(r.points[r.points.length - 1]!.date).toBe(r.horizon);
  });

  it('leaves out savings in a currency without a rate, and says so', () => {
    const usdSavings = { ...savings, id: 'usdsav', currency: 'USD', opening: 100_000 };
    const r = runway(
      plan({ accounts: [{ ...savings, opening: 1_000_000 }, spending, usdSavings] }),
      '2026-11-10',
    );
    expect(r.missing.map((a) => a.id)).toEqual(['usdsav']);
    const withRate = runway(
      plan({
        accounts: [{ ...savings, opening: 1_000_000 }, spending, usdSavings],
        rates: { USD: { rate: '0.3', on: '2026-11-01' } },
      }),
      '2026-11-10',
    );
    expect(withRate.start).toBe(1_000_000 + 300_000);
  });
});

describe('runway without a salary', () => {
  const history = data({
    accounts: [{ ...spending, opening: 1_000_000 }],
    txns: [
      txn({ date: '2026-08-10', amount: 300_000 }),
      txn({ date: '2026-09-10', amount: 300_000 }),
      txn({ date: '2026-10-10', amount: 300_000 }),
      txn({ date: '2026-10-15', amount: 60_000, kind: 'income' }),
    ],
  });

  it('averages the net outflow of the last three months', () => {
    expect(averageBurn(history, '2026-11-10')).toEqual({ burn: 280_000, months: 3 });
    expect(averageBurn(data(), '2026-11-10')).toEqual({ burn: 0, months: 0 });
  });

  it('projects the average month forward', () => {
    const r = runway(history, '2026-11-10');
    expect(r.mode).toBe('average');
    expect(r.start).toBe(1_000_000 - 900_000 + 60_000);
    expect(r.monthly).toBe(280_000);
    expect(r.periods).toBe(0);
    expect(r.runOut).toBe('2026-12-01');
  });

  it('lasts when you earn more than you spend', () => {
    const d = data({
      accounts: [{ ...spending, opening: 100_000 }],
      txns: [txn({ date: '2026-10-10', amount: 50_000, kind: 'income' })],
    });
    expect(runway(d, '2026-11-10')).toMatchObject({ mode: 'average', lasts: true, runOut: null });
  });

  it('answers how much more than you earn you can spend to reach a target', () => {
    const d = { ...history, target: { date: '2027-05-01', floor: 0, label: 'T' } };
    const t = runway(d, '2026-11-10').target!;
    expect(t.periods).toBe(6);
    expect(t.sustainable).toBe(Math.floor(160_000 / 6));
    expect(t.status).toBe('short');
  });

  it('has nothing to say without accounts', () => {
    expect(runway(data(), '2026-11-10')).toMatchObject({ mode: 'none', points: [] });
  });
});
