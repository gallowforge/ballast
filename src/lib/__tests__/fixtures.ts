import { emptyData } from '../defaults';
import type { Account, LedgerData, Recurring, Txn } from '../model';

let n = 0;

export function data(patch: Partial<LedgerData> = {}): LedgerData {
  return {
    ...emptyData(),
    ...patch,
    settings: { ...emptyData().settings, onboarded: true, ...patch.settings },
  };
}

export const savings: Account = {
  id: 'sav',
  name: 'Savings',
  role: 'savings',
  currency: 'USD',
  opening: 3_000_000,
  openedOn: '2026-01-01',
};
export const spending: Account = {
  id: 'cur',
  name: 'Current',
  role: 'spending',
  currency: 'USD',
  opening: 0,
  openedOn: '2026-01-01',
};
export const wallet: Account = {
  id: 'eur',
  name: 'Wallet',
  role: 'other',
  currency: 'EUR',
  opening: 0,
  openedOn: '2026-01-01',
};

export function txn(p: Partial<Txn> & Pick<Txn, 'date' | 'amount'>): Txn {
  n++;
  return {
    id: `t${n}`,
    kind: 'expense',
    accountId: 'cur',
    base: p.amount,
    payee: 'Shop',
    source: 'manual',
    createdAt: n,
    ...p,
  };
}

export function rec(p: Partial<Recurring> & Pick<Recurring, 'amount' | 'startOn'>): Recurring {
  n++;
  return {
    id: `r${n}`,
    name: 'Bill',
    kind: 'expense',
    accountId: 'cur',
    every: 1,
    unit: 'month',
    autoPost: false,
    ...p,
  };
}
