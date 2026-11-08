import { describe, expect, it } from 'vitest';
import { balance, balances, netWorth } from '../ledger';
import {
  addAccount,
  addCategory,
  addRecurring,
  addTxn,
  addTxns,
  catchUp,
  categorizeTxns,
  completeTxn,
  deleteAccount,
  deleteCategory,
  deleteTxns,
  dismiss,
  learnRule,
  payRecurring,
  removeBudget,
  removeRate,
  removeRecurring,
  removeRule,
  setBudget,
  setRate,
  setSalary,
  setSettings,
  setTarget,
  updateAccount,
  updateCategory,
  updateRecurring,
  updateTxn,
} from '../store/ops';
import { data, rec, savings, spending, txn, wallet } from './fixtures';

const base = () =>
  data({
    accounts: [savings, spending, wallet],
    rates: { USD: { rate: '0.3', on: '2026-11-01' } },
  });

describe('transactions', () => {
  it('fills in the base value from the account currency', () => {
    const d = addTxn({
      date: '2026-11-02',
      kind: 'income',
      accountId: 'usd',
      amount: 10_000,
      payee: 'Client',
      source: 'manual',
    })(base());
    expect(d.txns[0]).toMatchObject({ amount: 10_000, base: 30_000 });
  });
  it('converts what a transfer receives in another currency', () => {
    const t = completeTxn(base(), {
      date: '2026-11-02',
      kind: 'transfer',
      accountId: 'usd',
      toAccountId: 'sav',
      amount: 10_000,
      payee: 'Move',
      source: 'manual',
      categoryId: 'x',
    });
    expect(t.toAmount).toBe(30_000);
    expect(t.categoryId).toBeUndefined();
  });
  it('updates, recomputing the base when the amount changes', () => {
    let d = addTxn({
      id: 'x',
      date: '2026-11-02',
      kind: 'expense',
      accountId: 'usd',
      amount: 1_000,
      payee: 'A',
      source: 'manual',
    })(base());
    d = updateTxn('x', { amount: 2_000, payee: 'B' })(d);
    expect(d.txns[0]).toMatchObject({ id: 'x', amount: 2_000, base: 6_000, payee: 'B' });
    d = updateTxn('x', { note: 'n' })(d);
    expect(d.txns[0]!.base).toBe(6_000);
  });
  it('deletes and recategorises in bulk', () => {
    let d = addTxns([
      {
        id: 'a',
        date: '2026-11-02',
        kind: 'expense',
        accountId: 'cur',
        amount: 1,
        payee: 'A',
        source: 'manual',
      },
      {
        id: 'b',
        date: '2026-11-02',
        kind: 'expense',
        accountId: 'cur',
        amount: 1,
        payee: 'B',
        source: 'manual',
      },
      {
        id: 'c',
        date: '2026-11-02',
        kind: 'transfer',
        accountId: 'cur',
        toAccountId: 'sav',
        amount: 1,
        payee: 'C',
        source: 'manual',
      },
    ])(base());
    d = categorizeTxns(['a', 'c'], 'coffee')(d);
    expect(d.txns.map((t) => t.categoryId)).toEqual(['coffee', undefined, undefined]);
    expect(deleteTxns(['a', 'b'])(d).txns.map((t) => t.id)).toEqual(['c']);
  });
});

describe('balances', () => {
  it('adds opening, income, spending and transfers per account', () => {
    const d = {
      ...base(),
      txns: [
        txn({
          date: '2026-11-01',
          amount: 200_000,
          kind: 'transfer',
          accountId: 'sav',
          toAccountId: 'cur',
        }),
        txn({ date: '2026-11-02', amount: 5_000 }),
        txn({ date: '2026-11-03', amount: 10_000, kind: 'income', accountId: 'usd', base: 30_000 }),
      ],
    };
    expect(Object.fromEntries(balances(d))).toEqual({ sav: 2_800_000, cur: 195_000, usd: 10_000 });
    expect(balance(d, 'cur', '2026-11-01')).toBe(200_000);
    expect(netWorth(d)).toEqual({ total: 2_800_000 + 195_000 + 30_000, missing: [] });
  });
});

describe('accounts, categories and plans', () => {
  it('adds, updates and deletes an account with everything in it', () => {
    let d = addAccount({
      id: 'new',
      name: 'Cash',
      role: 'other',
      currency: 'KWD',
      opening: 0,
      openedOn: '2026-11-01',
    })(base());
    d = updateAccount('new', { name: 'Wallet cash' })(d);
    d = addTxn({
      date: '2026-11-02',
      kind: 'expense',
      accountId: 'new',
      amount: 1,
      payee: 'x',
      source: 'manual',
    })(d);
    d = setSalary({
      active: true,
      amount: 1,
      fromAccountId: 'new',
      toAccountId: 'cur',
      autoPost: true,
      startedOn: '2026-11-01',
    })(d);
    expect(d.accounts.find((a) => a.id === 'new')!.name).toBe('Wallet cash');
    const gone = deleteAccount('new')(d);
    expect(gone.accounts.some((a) => a.id === 'new')).toBe(false);
    expect(gone.txns).toHaveLength(0);
    expect(gone.salary).toBeNull();
  });
  it('deletes a category, moving its transactions', () => {
    let d = addCategory({ id: 'snacks', name: 'Snacks', kind: 'expense', hue: 40, icon: 'cookie' })(
      base(),
    );
    d = updateCategory('snacks', { name: 'Snacks & treats' })(d);
    d = addTxn({
      date: '2026-11-02',
      kind: 'expense',
      accountId: 'cur',
      amount: 1,
      payee: 'x',
      categoryId: 'snacks',
      source: 'manual',
    })(d);
    d = setBudget('snacks', 5_000, false, '2026-11-08')(d);
    d = deleteCategory('snacks', 'other')(d);
    expect(d.txns[0]!.categoryId).toBe('other');
    expect(d.budgets).toHaveLength(0);
  });
  it('sets budgets, keeping when they started', () => {
    let d = setBudget('coffee', 10_000, false, '2026-11-08')(base());
    expect(d.budgets[0]).toEqual({
      categoryId: 'coffee',
      amount: 10_000,
      rollover: false,
      since: '2026-11-01',
    });
    d = setBudget('coffee', 12_000, true, '2026-12-08')(d);
    expect(d.budgets[0]).toEqual({
      categoryId: 'coffee',
      amount: 12_000,
      rollover: true,
      since: '2026-11-01',
    });
    expect(removeBudget('coffee')(d).budgets).toHaveLength(0);
  });
  it('manages recurring items, rates, settings, targets and dismissals', () => {
    let d = addRecurring({
      id: 'r',
      name: 'Gym',
      kind: 'expense',
      amount: 1,
      accountId: 'cur',
      every: 1,
      unit: 'month',
      startOn: '2026-11-01',
      autoPost: false,
    })(base());
    d = updateRecurring('r', { amount: 2 })(d);
    expect(d.recurring[0]!.amount).toBe(2);
    expect(removeRecurring('r')(d).recurring).toHaveLength(0);
    d = setRate('EUR', '0.33', '2026-11-08')(d);
    expect(d.rates.EUR).toEqual({ rate: '0.33', on: '2026-11-08' });
    expect(removeRate('EUR')(d).rates.EUR).toBeUndefined();
    expect(setSettings({ cycleDay: 25 })(d).settings.cycleDay).toBe(25);
    expect(setTarget({ date: '2028-06-01', floor: 0, label: 'Goal' })(d).target!.label).toBe(
      'Goal',
    );
    expect(dismiss('x')(dismiss('x')(d)).dismissed).toEqual(['x']);
  });
  it('pays a manual recurring item', () => {
    let d = {
      ...base(),
      recurring: [rec({ id: 'r', amount: 7_000, startOn: '2026-11-05', categoryId: 'bills' })],
    };
    d = payRecurring(d, 'r', '2026-11-05')(d);
    expect(d.txns[0]).toMatchObject({ amount: 7_000, recurringId: 'r', categoryId: 'bills' });
    expect(d.recurring[0]!.lastPostedOn).toBe('2026-11-05');
    expect(payRecurring(d, 'missing', '2026-11-05')(d)).toBe(d);
  });
});

describe('learning from a correction', () => {
  it('remembers the merchant and sorts the others like it', () => {
    let d = {
      ...base(),
      txns: [
        txn({ id: 'a', date: '2026-11-01', amount: 1, payee: 'Blue Door Bakery' }),
        txn({ id: 'b', date: '2026-11-03', amount: 2, payee: 'BLUE DOOR BAKERY KW' }),
        txn({ id: 'c', date: '2026-11-03', amount: 2, payee: 'Other' }),
      ],
    };
    const { op, others } = learnRule(d, 'POS BLUE DOOR BAKERY', 'eating-out', 'Blue Door');
    expect(others).toBe(2);
    d = op(d);
    expect(d.rules[0]).toMatchObject({
      match: 'BLUE DOOR',
      categoryId: 'eating-out',
      payee: 'Blue Door',
    });
    expect(d.txns.map((t) => t.categoryId)).toEqual(['eating-out', 'eating-out', undefined]);
    expect(removeRule(d.rules[0]!.id)(d).rules).toHaveLength(0);
    expect(learnRule(d, '1234', 'other').others).toBe(0);
  });
});

describe('catching up', () => {
  it('posts the salary and automatic bills that fell due, once', () => {
    const d = {
      ...base(),
      salary: {
        active: true,
        amount: 200_000,
        fromAccountId: 'sav',
        toAccountId: 'cur',
        autoPost: true,
        startedOn: '2026-10-01',
      },
      recurring: [
        rec({
          id: 'gym',
          amount: 18_000,
          startOn: '2026-10-03',
          autoPost: true,
          categoryId: 'health',
        }),
        rec({ id: 'manual', amount: 1, startOn: '2026-10-03' }),
      ],
    };
    const first = catchUp(d, '2026-11-08');
    expect(first.posted).toBe(4);
    expect(first.data.salary!.lastPostedOn).toBe('2026-11-01');
    expect(first.data.recurring[0]!.lastPostedOn).toBe('2026-11-03');
    expect(first.data.txns.filter((t) => t.source === 'salary')).toHaveLength(2);
    expect(balance(first.data, 'cur')).toBe(400_000 - 36_000);
    const second = catchUp(first.data, '2026-11-08');
    expect(second.posted).toBe(0);
    expect(second.data).toBe(first.data);
  });
  it('pays a salary into a dollar account at the current rate', () => {
    const d = {
      ...base(),
      salary: {
        active: true,
        amount: 30_000,
        fromAccountId: 'sav',
        toAccountId: 'usd',
        autoPost: true,
        startedOn: '2026-11-01',
      },
    };
    const t = catchUp(d, '2026-11-08').data.txns[0]!;
    expect(t).toMatchObject({ kind: 'transfer', amount: 30_000, toAmount: 10_000 });
  });
});
