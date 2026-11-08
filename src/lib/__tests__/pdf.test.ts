import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { detectMapping } from '../import/detect';
import { groupLines, linesToTable, pageText, type TextItem } from '../import/pdf-layout';
import { extractItems, PdfNoTextError, PdfPasswordError } from '../import/pdf-text';
import { parseStatement } from '../import/statement';
import { sourceFromPdf } from '../import/importer';

const file = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
const expected = JSON.parse(readFileSync('tests/fixtures/sample-statement.json', 'utf8'));
const lib = pdfjs as unknown as Parameters<typeof extractItems>[0];

const item = (str: string, x: number, y: number, page = 1): TextItem => ({
  str,
  x,
  y,
  w: str.length * 5,
  h: 9,
  page,
});

describe('PDF layout', () => {
  it('groups runs on one baseline into a line, and close runs into one cell', () => {
    const lines = groupLines([
      item('POS', 100, 50),
      item('PURCHASE', 118, 50.6),
      item('4.250', 300, 50),
      item('Next', 100, 64),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.cells.map((c) => c.text)).toEqual(['POS PURCHASE', '4.250']);
  });

  it('places numbers by right edge under their heading and joins wrapped text', () => {
    const items = [
      item('Date', 40, 20),
      item('Description', 120, 20),
      item('Debit', 300, 20),
      item('Credit', 360, 20),
      item('Balance', 430, 20),
      item('02/11/2026', 40, 40),
      item('POS PURCHASE', 120, 40),
      item('4.250', 305, 40),
      item('995.750', 430, 40),
      item('TALABAT KUWAIT', 120, 50),
      item('03/11/2026', 40, 64),
      item('REFUND', 120, 64),
      item('1.000', 365, 64),
      item('996.750', 430, 64),
      item('Page 1 of 1', 250, 800),
    ];
    const table = linesToTable(groupLines(items))!;
    expect(table).toEqual([
      ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['02/11/2026', 'POS PURCHASE TALABAT KUWAIT', '4.250', '', '995.750'],
      ['03/11/2026', 'REFUND', '', '1.000', '996.750'],
    ]);
  });

  it('falls back to clustering numbers when there is no header row', () => {
    const items = [
      item('02/11/2026', 40, 40),
      item('COFFEE', 120, 40),
      item('1.500', 300, 40),
      item('98.500', 420, 40),
      item('03/11/2026', 40, 54),
      item('GIFT', 120, 54),
      item('20.000', 295, 54),
      item('118.500', 415, 54),
      item('04/11/2026', 40, 68),
      item('FUEL', 120, 68),
      item('5.000', 300, 68),
      item('113.500', 415, 68),
    ];
    const table = linesToTable(groupLines(items))!;
    expect(table[0]).toEqual(['Date', 'Description', 'Amount', 'Balance']);
    expect(table[2]).toEqual(['03/11/2026', 'GIFT', '20.000', '118.500']);
  });

  it('returns nothing for a page with no transactions', () => {
    expect(linesToTable(groupLines([item('Hello', 10, 10)]))).toBeNull();
  });
});

describe('the sample statement PDF, end to end', () => {
  it('reads every row and reconciles every running balance', async () => {
    const { items, pages } = await extractItems(lib, file('sample-statement.pdf'));
    expect(pages).toBe(2);
    expect(pageText(items)).toContain('EXAMPLE BANK');
    const source = sourceFromPdf(items, 'sample-statement.pdf')!;
    expect(source.currency).toBe('KWD');
    const mapping = detectMapping(source.table);
    expect(mapping.columns).toEqual([
      'date',
      'valueDate',
      'description',
      'debit',
      'credit',
      'balance',
    ]);
    const s = parseStatement(source.table, mapping, { exp: 3 });
    expect(s.rows).toHaveLength(expected.rows);
    expect(s.reconciliation.mismatched).toEqual([]);
    expect(s.reconciliation.matched).toBe(expected.rows);
    expect(s.reconciliation.opening).toBe(expected.opening);
    expect(s.reconciliation.closing).toBe(expected.closing);
    expect(-s.rows.filter((r) => r.amount < 0).reduce((a, r) => a + r.amount, 0)).toBe(
      expected.debit,
    );
    expect(s.rows[1]!.description).toBe(
      'POS PURCHASE 4111XXXXXXXX2290 STARBUCKS AVENUES KUWAIT KW',
    );
    expect(s.from).toBe('2026-10-01');
    expect(s.to).toBe('2026-10-31');
  });

  it('asks for the password of a locked statement, then opens it', async () => {
    await expect(extractItems(lib, file('sample-statement-locked.pdf'))).rejects.toMatchObject({
      name: 'PdfPasswordError',
      reason: 'need',
    });
    await expect(
      extractItems(lib, file('sample-statement-locked.pdf'), 'wrong'),
    ).rejects.toBeInstanceOf(PdfPasswordError);
    const { items } = await extractItems(lib, file('sample-statement-locked.pdf'), 'ledger-demo');
    expect(sourceFromPdf(items, 'x.pdf')!.table.length).toBeGreaterThan(expected.rows);
  });

  it('explains a PDF with no text layer', async () => {
    const fake = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getViewport: () => ({ height: 800 }),
            getTextContent: async () => ({ items: [] }),
          }),
          destroy: async () => undefined,
        }),
        destroy: async () => undefined,
      }),
    };
    await expect(extractItems(fake, new Uint8Array())).rejects.toBeInstanceOf(PdfNoTextError);
  });
});
