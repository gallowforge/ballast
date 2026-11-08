import { describe, expect, it } from 'vitest';
import { detectMapping } from '../import/detect';
import { parseStatement } from '../import/statement';

const parse = (rows: string[][], invert = false) =>
  parseStatement(rows, detectMapping(rows), { exp: 3, invert });

describe('statement rows', () => {
  it('signs debits and credits and checks every running balance', () => {
    const s = parse([
      ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['01/11/2026', 'Opening balance', '', '', '1,000.000'],
      ['02/11/2026', 'TALABAT', '4.250', '', '995.750'],
      ['03/11/2026', 'REFUND', '', '1.000', '996.750'],
      ['30/11/2026', 'Closing balance', '', '', '996.750'],
    ]);
    expect(s.rows.map((r) => r.amount)).toEqual([-4250, 1000]);
    expect(s.reconciliation).toMatchObject({
      checked: 2,
      matched: 2,
      mismatched: [],
      opening: 1_000_000,
      closing: 996_750,
    });
    expect(s.from).toBe('2026-11-02');
    expect(s.to).toBe('2026-11-03');
  });

  it('flags a row whose balance does not follow', () => {
    const s = parse([
      ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['02/11/2026', 'A', '4.250', '', '995.750'],
      ['03/11/2026', 'B', '1.000', '', '990.000'],
    ]);
    expect(s.reconciliation.mismatched).toEqual([3]);
    expect(s.reconciliation.opening).toBe(1_000_000);
  });

  it('reads newest-first statements oldest-first', () => {
    const s = parse([
      ['Date', 'Description', 'Amount', 'Balance'],
      ['03/11/2026', 'B', '-1.000', '994.750'],
      ['02/11/2026', 'A', '-4.250', '995.750'],
    ]);
    expect(s.descending).toBe(true);
    expect(s.rows.map((r) => r.description)).toEqual(['A', 'B']);
    expect(s.reconciliation.matched).toBe(1);
  });

  it('works out signs from the balance when amounts are unsigned', () => {
    const s = parse([
      ['Date', 'Description', 'Amount', 'Balance'],
      ['01/11/2026', 'Opening balance', '', '100.000'],
      ['02/11/2026', 'Coffee', '1.500', '98.500'],
      ['03/11/2026', 'Gift', '20.000', '118.500'],
    ]);
    expect(s.rows.map((r) => r.amount)).toEqual([-1500, 20000]);
    expect(s.reconciliation.inferred).toBe(1);
    expect(s.reconciliation.matched).toBe(2);
  });

  it('reads a debit or credit type column', () => {
    const rows = [
      ['Date', 'Narrative', 'Amount', 'Dr/Cr'],
      ['02/11/2026', 'Coffee', '1.500', 'DR'],
      ['03/11/2026', 'Salary', '200.000', 'CR'],
    ];
    expect(parse(rows).rows.map((r) => r.amount)).toEqual([-1500, 200000]);
  });

  it('joins wrapped descriptions to the row above', () => {
    const s = parse([
      ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['02/11/2026', 'POS PURCHASE', '4.250', '', '995.750'],
      ['', 'TALABAT KUWAIT', '', '', ''],
      ['03/11/2026', 'ATM', '20.000', '', '975.750'],
    ]);
    expect(s.rows[0]!.description).toBe('POS PURCHASE TALABAT KUWAIT');
    expect(s.rows).toHaveLength(2);
  });

  it('skips totals, zero rows and lines without a date, and says why', () => {
    const s = parse([
      ['Date', 'Description', 'Amount'],
      ['02/11/2026', 'Coffee', '-1.500'],
      ['03/11/2026', 'Info only', '0.000'],
      ['Total', '', '-1.500'],
      ['junk', '', '5.000'],
    ]);
    expect(s.rows).toHaveLength(1);
    expect(s.skipped).toEqual([
      { line: 3, reason: 'Zero amount' },
      { line: 5, reason: 'No date' },
    ]);
  });

  it('can flip signs for exports that list spending as positive', () => {
    expect(
      parse(
        [
          ['Date', 'Description', 'Amount'],
          ['02/11/2026', 'Coffee', '1.500'],
        ],
        true,
      ).rows[0]!.amount,
    ).toBe(-1500);
  });

  it('works out the closing balance after the last balance it saw', () => {
    const s = parse([
      ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['02/11/2026', 'A', '4.250', '', '995.750'],
      ['03/11/2026', 'B', '1.000', '', ''],
    ]);
    expect(s.reconciliation.closing).toBe(994_750);
  });
});
