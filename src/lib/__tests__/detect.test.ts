import { describe, expect, it } from 'vitest';
import { detectMapping, findHeader, mappingProblems, roleFor } from '../import/detect';

describe('header words', () => {
  it.each([
    ['Posting Date', 'date'],
    ['Value Date', 'valueDate'],
    ['Transaction Details', 'description'],
    ['Narrative', 'description'],
    ['Debit', 'debit'],
    ['Withdrawals', 'debit'],
    ['Credit', 'credit'],
    ['Deposits', 'credit'],
    ['Amount (EUR)', 'amount'],
    ['Amount USD', 'amount'],
    ['Balance in GBP', 'balance'],
    ['Debit KD', 'debit'],
    ['Money in', 'credit'],
    ['Running Balance', 'balance'],
    ['Ref No.', 'reference'],
    ['Dr/Cr', 'type'],
    ['Something else', null],
    ['', null],
  ])('%j → %s', (cell, role) => expect(roleFor(cell)).toBe(role));
  it('finds the header below a statement banner', () => {
    const rows = [
      ['Example Bank'],
      ['Account statement', 'November'],
      ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['01/11/2026', 'x', '1.000', '', '9.000'],
    ];
    expect(findHeader(rows)).toBe(2);
    expect(
      findHeader([
        ['a', 'b'],
        ['1', '2'],
      ]),
    ).toBe(-1);
  });
});

describe('mapping', () => {
  it('maps a debit and credit layout from its header', () => {
    const m = detectMapping([
      ['Posting Date', 'Value Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['02/11/2026', '02/11/2026', 'UBER EATS', '4.250', '', '995.750'],
      ['25/11/2026', '25/11/2026', 'SALARY', '', '200.000', '1,195.750'],
    ]);
    expect(m.header).toBe(0);
    expect(m.columns).toEqual(['date', 'valueDate', 'description', 'debit', 'credit', 'balance']);
    expect(m.dateOrder).toBe('dmy');
    expect(m.decimal).toBe('.');
    expect(mappingProblems(m)).toEqual([]);
  });
  it('uses the value date when it is the only date', () => {
    const m = detectMapping([
      ['Value date', 'Details', 'Amount'],
      ['2026-11-02', 'Coffee', '-1.500'],
    ]);
    expect(m.columns).toEqual(['date', 'description', 'amount']);
  });
  it('works out a headerless export from its values', () => {
    const m = detectMapping([
      ['02/11/2026', 'UBER EATS AMSTERDAM', '-4.250', '995.750'],
      ['03/11/2026', 'ALBERT HEIJN', '-12.300', '983.450'],
      ['15/11/2026', 'UPWORK ESCROW', '120.000', '1,103.450'],
    ]);
    expect(m.header).toBe(-1);
    expect(m.columns).toEqual(['date', 'description', 'amount', 'balance']);
  });
  it('finds debit, credit and balance among three number columns', () => {
    const m = detectMapping([
      ['02/11/2026', 'A', '4.250', '', '995.750'],
      ['03/11/2026', 'B', '', '10.000', '1,005.750'],
      ['04/11/2026', 'C', '1.000', '', '1,004.750'],
    ]);
    expect(m.columns).toEqual(['date', 'description', 'debit', 'credit', 'balance']);
  });
  it('explains what is missing', () => {
    expect(
      mappingProblems({ header: -1, columns: ['ignore'], dateOrder: 'dmy', decimal: '.' }),
    ).toHaveLength(3);
  });
  it('detects month-first dates and comma decimals', () => {
    const m = detectMapping([
      ['Date', 'Payee', 'Amount'],
      ['11/25/2026', 'Shop', '-1.234,50'],
      ['11/26/2026', 'Shop', '-12,00'],
    ]);
    expect(m.dateOrder).toBe('mdy');
    expect(m.decimal).toBe(',');
  });
});
