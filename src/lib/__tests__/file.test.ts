import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FILE_MESSAGES,
  MAX_BYTES,
  StatementFileError,
  decodeText,
  fileKind,
  readFailure,
} from '../import/file';
import { sourceFromText } from '../import/importer';
import { PdfNoTextError } from '../import/pdf-text';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p)] : p)));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52];
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0x06, 0, 0x08, 0];
const csv = readFileSync('tests/fixtures/sample-statement.csv');
const pdf = readFileSync('tests/fixtures/sample-statement.pdf');

function refused(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(StatementFileError);
    return (e as Error).message;
  }
  throw new Error('expected the file to be refused');
}

describe('deciding what a chosen file is', () => {
  it('sends PDFs to the PDF reader by their header, whatever the name', () => {
    expect(fileKind('statement.pdf', 'application/pdf', new Uint8Array(pdf))).toBe('pdf');
    expect(fileKind('download', '', new Uint8Array(pdf))).toBe('pdf');
  });

  it('lets the PDF reader try a damaged PDF that lost its header', () => {
    expect(fileKind('statement.pdf', '', bytes('garbage, not a header'))).toBe('pdf');
  });

  it('sends CSV and plain text to the CSV reader', () => {
    expect(fileKind('statement.csv', 'text/csv', new Uint8Array(csv))).toBe('text');
    expect(fileKind('export.txt', 'text/plain', bytes('a,b\n1,2'))).toBe('text');
    expect(fileKind('export.xls', '', bytes('Date\tAmount\n01/11/2026\t5'))).toBe('text');
  });

  it('refuses images, even ones named like a statement', () => {
    expect(refused(() => fileKind('pic.png', 'image/png', bytes(PNG)))).toBe(
      FILE_MESSAGES.notStatement,
    );
    expect(refused(() => fileKind('fake.pdf', '', bytes(PNG)))).toBe(FILE_MESSAGES.notStatement);
    expect(refused(() => fileKind('photo', 'image/heic', bytes('anything')))).toBe(
      FILE_MESSAGES.notStatement,
    );
    expect(refused(() => fileKind('letter.docx', '', bytes('PK text-like')))).toBe(
      FILE_MESSAGES.notStatement,
    );
  });

  it('does not take metadata in an image for a PDF header', () => {
    expect(refused(() => fileKind('scan.pdf', '', bytes(PNG, 'tEXt XMP %PDF-1.7')))).toBe(
      FILE_MESSAGES.notStatement,
    );
  });

  it('asks for a CSV when given a spreadsheet, but reads text saved under that name', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from('Date\tAmount\n1/11\t5', 'utf16le')]);
    expect(fileKind('export.xls', '', utf16)).toBe('text');
    expect(refused(() => fileKind('statement.xlsx', '', bytes(ZIP, 'xl/workbook.xml')))).toBe(
      FILE_MESSAGES.spreadsheet,
    );
  });

  it('tells an empty file from one that is too big', () => {
    expect(refused(() => fileKind('a.csv', 'text/csv', new Uint8Array(0)))).toBe(
      FILE_MESSAGES.empty,
    );
    expect(refused(() => fileKind('a.csv', 'text/csv', bytes(' \r\n\t\n')))).toBe(
      FILE_MESSAGES.empty,
    );
    expect(refused(() => fileKind('a.csv', 'text/csv', new Uint8Array(MAX_BYTES + 1)))).toBe(
      FILE_MESSAGES.tooBig,
    );
  });
});

describe('reading a text export', () => {
  it('reads UTF-8 with or without a byte-order mark', () => {
    expect(decodeText(bytes('Café,1'))).toBe('Café,1');
    expect(decodeText(bytes([0xef, 0xbb, 0xbf], 'Café,1'))).toBe('Café,1');
  });

  it('reads UTF-16 with a byte-order mark', () => {
    const le = new Uint8Array([0xff, 0xfe, ...Buffer.from('Date\tAmount', 'utf16le')]);
    expect(decodeText(le)).toBe('Date\tAmount');
  });

  it('reads older exports in the Windows Western encoding', () => {
    expect(decodeText(bytes('Caf', [0xe9], ' Ren', [0xe9], ',4', [0x80]))).toBe('Café René,4€');
  });

  it('refuses binary content that slipped past the name and type', () => {
    const noise = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
    expect(refused(() => decodeText(noise))).toBe(FILE_MESSAGES.notStatement);
    expect(refused(() => decodeText(bytes(PNG, [0, 0, 0, 1, 0, 0])))).toBe(
      FILE_MESSAGES.notStatement,
    );
  });

  it('keeps a table with a stray control byte, and says when nothing but a mark remains', () => {
    expect(decodeText(bytes('date,amount,payee,notes\n', [0], 'x,1,y,z\n'))).toContain('x,1');
    expect(decodeText(bytes('date,amount\n1/11,5\n', new Array(400).fill(0)))).toContain('1/11,5');
    expect(refused(() => decodeText(bytes([0xef, 0xbb, 0xbf], '  \n')))).toBe(FILE_MESSAGES.empty);
  });

  it('turns the bytes into a table, or says why there is none', () => {
    expect(
      sourceFromText(new Uint8Array(csv), 'sample-statement.csv').table.length,
    ).toBeGreaterThan(30);
    expect(
      refused(() =>
        sourceFromText(bytes('hello world, plain text that is not a statement\n'), 'notes.txt'),
      ),
    ).toBe(FILE_MESSAGES.noRows);
    expect(refused(() => sourceFromText(bytes('just one line\nand another\n'), 'notes.txt'))).toBe(
      FILE_MESSAGES.noRows,
    );
  });

  it('drops control characters from the table it shows', () => {
    const src = sourceFromText(
      bytes('this,is,not\n"a bank";statement;;;\n', [0, 1], 'garbage,,\n12/34/5678,abc,--\n'),
      'junk.csv',
    );
    expect(src.table.flat().join('')).not.toMatch(/[\u0000-\u001f]/);
    expect(src.table.flat()).toContain('garbage');
  });
});

describe('what a failed read says', () => {
  it("passes Ballast's own words through", () => {
    expect(readFailure(new StatementFileError(FILE_MESSAGES.noRows), 'text')).toBe(
      FILE_MESSAGES.noRows,
    );
    expect(readFailure(new PdfNoTextError(), 'pdf')).toBe(new PdfNoTextError().message);
  });

  it("never shows a library's message", () => {
    expect(readFailure(new Error('Invalid PDF structure.'), 'pdf')).toBe(FILE_MESSAGES.damagedPdf);
    expect(readFailure(new TypeError('x is undefined'), 'text')).toBe(FILE_MESSAGES.unreadable);
    expect(readFailure('weird', 'pdf')).toBe(FILE_MESSAGES.damagedPdf);
  });
});
