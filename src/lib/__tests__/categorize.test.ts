import { describe, expect, it } from 'vitest';
import { categorize, ruleKey } from '../import/categorize';
import { cleanPayee, merchantKey, titleCase } from '../import/clean';
import type { Rule } from '../model';

describe('payee cleanup', () => {
  it.each([
    ['POS PURCHASE 4111XXXXXXXX2290 STARBUCKS CANAL STREET', 'Starbucks Canal Street'],
    [
      'POS PURCHASE 4111XXXXXXXX1234 WHOLE FOODS MARKET AUSTIN TX 08/11 14:32',
      'Whole Foods Market Austin',
    ],
    ['DIRECT DEBIT PULSE FITNESS', 'Pulse Fitness'],
    ['STANDING ORDER MAPLE COURT RENT', 'Maple Court Rent'],
    ['SPOTIFY P2D4F9 STOCKHOLM SE', 'Spotify P2d4f9 Stockholm'],
    ['ATM WITHDRAWAL 000117 HIGH STREET', 'ATM Withdrawal High Street'],
    ['ECOM PURCHASE ZALANDO EUR 39.95 BERLIN DE', 'Zalando Berlin'],
    ['ECOM PURCHASE AMAZON.COM USD 23.49 AMZN MKTP US', 'Amazon.com Amzn Mktp'],
    ['APPLE PAY BLUE BOTTLE COFFEE 08/11 14:32', 'Blue Bottle Coffee'],
    ['CONTACTLESS PRET A MANGER LONDON GB', 'Pret A Manger London'],
    ['ACME TRADING GMBH', 'Acme Trading'],
    [
      'EFTPOS PURCHASE NORTHGATE HYPERMARKET WEST QUAY AUSTRALIA',
      'Northgate Hypermarket West Quay',
    ],
    ['12345678', '12345678'],
    ['', 'Unknown'],
  ])('%j → %j', (raw, out) => expect(cleanPayee(raw)).toBe(out));
  it('keeps acronyms upper case', () =>
    expect(titleCase('bp station and the atm')).toBe('BP Station and the ATM'));
  it('builds a letters-only key', () =>
    expect(merchantKey('POS PURCHASE UBER *EATS 123 NL')).toBe('UBER EATS'));
});

describe('categories from statement text', () => {
  it.each([
    ['POS PURCHASE 4111XXXXXXXX2290 UBER *EATS', 'out', 'delivery', 'Uber Eats'],
    ['UBER *TRIP HELP.UBER.COM', 'out', 'transport', 'Uber'],
    ['DELIVEROO LONDON GB', 'out', 'delivery', 'Deliveroo'],
    ['POS PURCHASE TESCO STORES 2041', 'out', 'groceries', 'Tesco'],
    ['POS PURCHASE ALDI RIVERSIDE', 'out', 'groceries', 'Aldi'],
    ['POS PURCHASE SHELL HARBOUR ROAD', 'out', 'fuel', 'Shell'],
    ['T-MOBILE POSTPAID BILL', 'out', 'bills', 'T-Mobile'],
    ['NETFLIX.COM 866-579-7172', 'out', 'subscriptions', 'Netflix'],
    ['AMAZON PRIME*2K4LM9', 'out', 'subscriptions', 'Amazon Prime'],
    ['AMZN MKTP US*2K4LM9', 'out', 'shopping', 'Amazon'],
    ['APPLE.COM/BILL ITUNES.COM IE', 'out', 'subscriptions', 'Apple'],
    ['STANDING ORDER MAPLE COURT RENT', 'out', 'home', 'Maple Court Rent'],
    ['HERTZ RENT A CAR LISBON', 'out', 'travel', 'Hertz Rent A Car Lisbon'],
    ['UBER ELECTRIC BIKE RIDE', 'out', 'transport', 'Uber'],
    ['DIRECT DEBIT CITY POWER ELECTRICITY', 'out', 'home', 'City Power Electricity'],
    ['STEAMGAMES.COM 4259522985', 'out', 'fun', 'Steamgames.com'],
    ['CVS/PHARMACY #0412', 'out', 'health', 'CVS/Pharmacy'],
    ['MSFT *XBOX GAME PASS', 'out', 'subscriptions', 'Microsoft'],
    ['DIRECT DEBIT HARBOUR ELECTRICITY CO P.J.S.C.', 'out', 'home', 'Harbour Electricity'],
    ['POS PURCHASE TALABAT GENERAL TRADING', 'out', 'delivery', 'Talabat'],
    ['ATM WITHDRAWAL 000117', 'out', 'cash', 'Cash withdrawal'],
    ['SERVICE CHARGE ACCOUNT MAINTENANCE', 'out', 'fees', 'Service Charge Account Maintenance'],
    ['MONTHLY SALARY ACME', 'in', 'salary', 'Salary'],
    ['UNEMPLOYMENT BENEFIT PAYMENT', 'in', 'allowance', 'Unemployment Benefit Payment'],
    ['REFUND IKEA ONLINE ORDER', 'in', 'refunds', 'Refund IKEA Online Order'],
    ['UPWORK ESCROW INC', 'in', 'freelance', 'Upwork Escrow'],
  ] as const)('%j (%s) → %s', (raw, dir, cat, payee) => {
    const g = categorize(raw, dir, []);
    expect(g.categoryId).toBe(cat);
    expect(g.payee).toBe(payee);
  });
  it('lets your own rule win, longest match first', () => {
    const rules: Rule[] = [
      { id: 'a', match: 'UBER', categoryId: 'transport', createdAt: 1 },
      { id: 'b', match: 'UBER EATS', categoryId: 'eating-out', payee: 'Takeaway', createdAt: 2 },
    ];
    expect(categorize('POS UBER *EATS PENDING', 'out', rules)).toMatchObject({
      categoryId: 'eating-out',
      payee: 'Takeaway',
      ruleId: 'b',
    });
  });
  it('spots transfers between your own accounts', () => {
    expect(categorize('TRANSFER FROM SAVINGS OWN ACCOUNT 0021', 'in', []).transfer).toBe(true);
    expect(categorize('POS COFFEE', 'out', []).transfer).toBe(false);
  });
  it('does not call money in a cash withdrawal, or rent paid to you a cost', () => {
    expect(categorize('ATM DEPOSIT', 'in', []).categoryId).toBeUndefined();
    expect(categorize('RENT FROM TENANT', 'in', []).categoryId).toBeUndefined();
  });
  it('leaves the unknown uncategorised with a tidy name', () => {
    const tidy = { payee: 'Blue Door', transfer: false };
    expect(categorize('POS PURCHASE BLUE DOOR', 'out', [])).toEqual(tidy);
    // Whichever card network the line opens with, with or without the kind of card after it.
    for (const network of [
      'VISA',
      'MASTERCARD',
      'UNIONPAY',
      'BANCONTACT',
      'DANKORT',
      'EFTPOS',
      'GIROCARD',
      'INTERAC',
      'KNET',
      'RUPAY',
    ]) {
      expect(categorize(`${network} POS PURCHASE BLUE DOOR`, 'out', [])).toEqual(tidy);
      expect(categorize(`${network} DEBIT CARD BLUE DOOR`, 'out', [])).toEqual(tidy);
    }
    // Whatever legal form the company's name ends with.
    for (const form of [
      'INC',
      'LTD.',
      'GMBH',
      'W.L.L',
      'JSC',
      'P.J.S.C.',
      'B.S.C',
      'K.S.C.C',
      'QSC',
    ])
      expect(categorize(`POS PURCHASE BLUE DOOR ${form}`, 'out', [])).toEqual(tidy);
    // A network's name is only dropped when it is the whole word, and a shop may share one.
    expect(categorize('POS PURCHASE MAESTRO BAKERY', 'out', []).payee).toBe('Maestro Bakery');
    expect(categorize('INTERACTIVE BLUE DOOR', 'out', []).payee).toBe('Interactive Blue Door');
  });
  it('makes rule keys from the first two words', () =>
    expect(ruleKey('POS PURCHASE UBER *EATS AMSTERDAM NL')).toBe('UBER EATS'));
});
