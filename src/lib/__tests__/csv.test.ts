import { describe, expect, it } from 'vitest';
import { parseCSV, sniffDelimiter, toCSV } from '../import/csv';

describe('CSV', () => {
  it('reads plain rows', () => {
    expect(parseCSV('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('handles quotes, doubled quotes and commas inside quotes', () => {
    expect(parseCSV('"Shop, Inc","He said ""hi""",3')).toEqual([
      ['Shop, Inc', 'He said "hi"', '3'],
    ]);
  });
  it('keeps line breaks inside quoted fields', () => {
    expect(parseCSV('"line one\nline two",2\r\nx,y')).toEqual([
      ['line one\nline two', '2'],
      ['x', 'y'],
    ]);
  });
  it('strips a byte-order mark and blank lines', () => {
    expect(parseCSV('﻿date,amount\n\n2026-11-01,5\n\n')).toEqual([
      ['date', 'amount'],
      ['2026-11-01', '5'],
    ]);
  });
  it('drops control characters but keeps tabs and line breaks', () => {
    expect(parseCSV('a\u0000b,c\u0001\n"x\u001fy",z\u007f\n1\t2,3')).toEqual([
      ['ab', 'c'],
      ['xy', 'z'],
      ['1\t2', '3'],
    ]);
  });
  it('keeps empty fields in the middle and at the end', () => {
    expect(parseCSV('a,,c,\n')).toEqual([['a', '', 'c', '']]);
  });
  it.each([
    ['a;b;c\n1;2;3', ';'],
    ['a\tb\tc\n1\t2\t3', '\t'],
    ['a|b|c\n1|2|3', '|'],
    ['date,desc,amount\n01/11/2026,"Coffee; large",1.5', ','],
    ['Date;Description;Amount\n01.11.2026;Coffee, large;1,50', ';'],
  ])('sniffs the delimiter of %j', (text, d) => expect(sniffDelimiter(text)).toBe(d));
  it('writes CSV that reads back the same', () => {
    const rows = [
      ['Date', 'Payee', 'Note'],
      ['2026-11-01', 'Shop, Inc', 'said "hi"'],
      ['2026-11-02', ' padded ', 'two\nlines'],
    ];
    const text = toCSV(rows);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(parseCSV(text).map((r) => r.length)).toEqual([3, 3, 3]);
    expect(parseCSV(text)[1]).toEqual(['2026-11-01', 'Shop, Inc', 'said "hi"']);
  });
});
