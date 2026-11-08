import { describe, expect, it } from 'vitest';
import { budgetState, budgetStates, budgetTotals, carryInto, suggestBudget } from '../calc/budgets';
import { cycleOf } from '../dates';
import type { Budget } from '../model';
import { data, spending, txn } from './fixtures';

const coffee: Budget = {
  categoryId: 'coffee',
  amount: 20_000,
  rollover: false,
  since: '2026-09-01',
};

function withCoffee(amounts: [string, number][], budget = coffee) {
  return data({
    accounts: [spending],
    budgets: [budget],
    txns: amounts.map(([date, amount]) => txn({ date, amount, categoryId: 'coffee' })),
  });
}

describe('budgets', () => {
  it('is idle before anything is spent', () => {
    expect(budgetState(withCoffee([]), coffee, '2026-11-10').status).toBe('idle');
  });
  it('is fine while spending follows the month', () => {
    const s = budgetState(withCoffee([['2026-11-05', 6_000]]), coffee, '2026-11-15');
    expect(s).toMatchObject({ status: 'ok', spent: 6_000, left: 14_000, available: 20_000 });
    expect(s.perDayLeft).toBe(Math.floor(14_000 / 16));
  });
  it('flags running ahead of pace', () => {
    expect(budgetState(withCoffee([['2026-11-02', 12_000]]), coffee, '2026-11-05').status).toBe(
      'ahead',
    );
  });
  it('flags going over', () => {
    const s = budgetState(withCoffee([['2026-11-02', 25_000]]), coffee, '2026-11-05');
    expect(s).toMatchObject({ status: 'over', left: -5_000, perDayLeft: 0 });
    expect(s.used).toBeCloseTo(1.25);
  });
  it('rolls unspent money forward, and takes overspending back', () => {
    const b = { ...coffee, rollover: true };
    const d = withCoffee(
      [
        ['2026-09-10', 15_000], // 5 left
        ['2026-10-10', 28_000], // 8 over
      ],
      b,
    );
    expect(carryInto(d, b, cycleOf('2026-11-10', 1))).toBe(-3_000);
    expect(budgetState(d, b, '2026-11-10').available).toBe(17_000);
    expect(carryInto(d, coffee, cycleOf('2026-11-10', 1))).toBe(0);
  });
  it('adds up the month, including spending without a budget', () => {
    const d = withCoffee([['2026-11-02', 4_000]]);
    d.txns.push(
      txn({ date: '2026-11-03', amount: 9_000, categoryId: 'fuel' }),
      txn({ date: '2026-11-03', amount: 1_000 }),
    );
    expect(budgetTotals(d, '2026-11-10')).toEqual({
      budgeted: 20_000,
      spent: 4_000,
      unbudgeted: 10_000,
    });
    expect(budgetStates(d, '2026-11-10')).toHaveLength(1);
  });
  it('suggests a budget from the last three months, rounded up', () => {
    const d = withCoffee([
      ['2026-08-10', 10_000],
      ['2026-09-10', 14_000],
      ['2026-10-10', 15_500],
    ]);
    expect(suggestBudget(d, 'coffee', '2026-11-10')).toBe(14_000);
    expect(suggestBudget(data(), 'coffee', '2026-11-10')).toBe(0);
  });
});
