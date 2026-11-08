import { describe, expect, it } from 'vitest';
import { categorize, ruleKey } from '../import/categorize';
import { cleanPayee, merchantKey, titleCase } from '../import/clean';
import type { Rule } from '../model';

describe('payee cleanup', () => {
  it.each([
    ['POS PURCHASE 4111XXXXXXXX2290 STARBUCKS AVENUES KUWAIT KW', 'Starbucks Avenues'],
    ['POS PURCHASE 4111XXXXXXXX2290 TALABAT GENERAL TRADING KW', 'Talabat General Trading'],
    ['KNET PURCHASE GYM OXYGEN FITNESS', 'Gym Oxygen Fitness'],
    ['POS PURCHASE LULU HYPERMARKET AL RAI KUWAIT', 'Lulu Hypermarket Al Rai'],
    ['SPOTIFY P2D4F9 STOCKHOLM SE', 'Spotify P2d4f9 Stockholm'],
    ['ATM WITHDRAWAL 000117 HAWALLY', 'ATM Withdrawal Hawally'],
    ['ECOM PURCHASE AMAZON.COM USD 23.49 AMZN MKTP US', 'Amazon.com Amzn Mktp'],
    ['APPLE PAY CARIBOU COFFEE 08/11 14:32', 'Caribou Coffee'],
    ['ZAIN KUWAIT K.S.C.P.', 'Zain'],
    ['12345678', '12345678'],
    ['', 'Unknown'],
  ])('%j → %j', (raw, out) => expect(cleanPayee(raw)).toBe(out));
  it('keeps acronyms upper case', () =>
    expect(titleCase('knpc station and the atm')).toBe('KNPC Station and the ATM'));
  it('builds a letters-only key', () =>
    expect(merchantKey('POS PURCHASE TALABAT 123 KW')).toBe('TALABAT'));
});

describe('categories from statement text', () => {
  it.each([
    ['POS PURCHASE TALABAT GENERAL TRADING KW', 'out', 'delivery', 'Talabat'],
    ['POS PURCHASE LULU HYPERMARKET', 'out', 'groceries', 'Lulu Hypermarket'],
    ['POS PURCHASE KNPC STATION 112', 'out', 'fuel', 'KNPC'],
    ['STC KUWAIT POSTPAID BILL', 'out', 'bills', 'stc'],
    ['NETFLIX.COM 866-579-7172', 'out', 'subscriptions', 'Netflix'],
    ['APPLE.COM/BILL ITUNES.COM IE', 'out', 'subscriptions', 'Apple'],
    ['ATM WITHDRAWAL 000117', 'out', 'cash', 'Cash withdrawal'],
    ['SERVICE CHARGE ACCOUNT MAINTENANCE', 'out', 'fees', 'Service Charge Account Maintenance'],
    ['MONTHLY SALARY ACME', 'in', 'salary', 'Salary'],
    ['REFUND XCITE ONLINE ORDER', 'in', 'refunds', 'Refund Xcite Online Order'],
    ['UPWORK ESCROW INC', 'in', 'freelance', 'Upwork Escrow'],
  ] as const)('%j (%s) → %s', (raw, dir, cat, payee) => {
    const g = categorize(raw, dir, []);
    expect(g.categoryId).toBe(cat);
    expect(g.payee).toBe(payee);
  });
  it('lets your own rule win, longest match first', () => {
    const rules: Rule[] = [
      { id: 'a', match: 'TALABAT', categoryId: 'eating-out', createdAt: 1 },
      {
        id: 'b',
        match: 'TALABAT GENERAL',
        categoryId: 'groceries',
        payee: 'Talabat Mart',
        createdAt: 2,
      },
    ];
    expect(categorize('POS TALABAT GENERAL TRADING', 'out', rules)).toMatchObject({
      categoryId: 'groceries',
      payee: 'Talabat Mart',
      ruleId: 'b',
    });
  });
  it('spots transfers between your own accounts', () => {
    expect(categorize('TRANSFER FROM SAVINGS OWN ACCOUNT 0021', 'in', []).transfer).toBe(true);
    expect(categorize('POS COFFEE', 'out', []).transfer).toBe(false);
  });
  it('does not call money in a cash withdrawal', () =>
    expect(categorize('ATM DEPOSIT', 'in', []).categoryId).toBeUndefined());
  it('leaves the unknown uncategorised with a tidy name', () =>
    expect(categorize('POS PURCHASE BLUE DOOR', 'out', [])).toEqual({
      payee: 'Blue Door',
      transfer: false,
    }));
  it('makes rule keys from the first two words', () =>
    expect(ruleKey('POS PURCHASE TALABAT GENERAL TRADING KW')).toBe('TALABAT GENERAL'));
});
