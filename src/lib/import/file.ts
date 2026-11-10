import { CONTROL_CHARS } from './csv';
import { PdfNoTextError } from './pdf-text';

/**
 * What a chosen file is, decided before anything tries to read it: a PDF for pdf.js, text for the
 * CSV reader, or something that is not a statement at all, said plainly. Every message a person
 * can see comes from here or from the PDF reader's own errors, never from a library's internals.
 */

/** A problem with the file itself, worded for the person who chose it. */
export class StatementFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementFileError';
  }
}

export const MAX_BYTES = 25 * 1024 * 1024;

export const FILE_MESSAGES = {
  tooBig: 'That file is over 25 MB, which is far bigger than a statement. Is it the right file?',
  empty: 'This file is empty: there is nothing in it to read. Try downloading the statement again.',
  notStatement: 'This does not look like a statement. Ballast reads PDF and CSV files.',
  spreadsheet:
    'This is a spreadsheet file, which Ballast cannot open directly. Save it as CSV from your spreadsheet app, then bring that in.',
  noRows:
    'Ballast found no rows of transactions in this file. Is it the CSV export of a statement?',
  noPdfTable:
    'Ballast read this PDF but could not find a table of transactions in it. If your bank offers a CSV export, that will work.',
  damagedPdf:
    "This PDF could not be opened. It may be damaged: download the statement again, or use your bank's CSV export.",
  unreadable: 'Ballast could not read this file. Is it a statement in PDF or CSV form?',
} as const;

export type FileKind = 'pdf' | 'text';

const ext = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

/** Formats that are never a statement, whatever their content. */
const NOT_STATEMENT_EXT = new Set(
  (
    'png jpg jpeg gif webp heic heif avif bmp tif tiff svg ico mp3 m4a wav aac ogg flac mp4 mov ' +
    'm4v avi mkv webm zip gz tgz 7z rar bz2 xz doc docx odt pages rtf ppt pptx key odp exe dmg ' +
    'pkg apk msi iso'
  ).split(' '),
);
const SPREADSHEET_EXT = new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'numbers']);

function startsWith(bytes: Uint8Array, sig: number[], at = 0): boolean {
  return sig.every((b, i) => bytes[at + i] === b);
}

/** "%PDF-" in the first kilobyte, where readers look for it. */
function hasPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i < end; i++)
    if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return true;
  return false;
}

/** Images, media and archives, recognised by their first bytes. */
function binarySignature(bytes: Uint8Array): 'archive' | 'other' | null {
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]))
    return 'archive'; // zip (xlsx, docx, ods, numbers) or the old Office container (xls, doc)
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) || // PNG
    startsWith(bytes, [0xff, 0xd8, 0xff]) || // JPEG
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) || // GIF
    startsWith(bytes, [0x1f, 0x8b]) || // gzip
    (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) || // WebP
    startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4) // HEIC, MP4, MOV
  )
    return 'other';
  return null;
}

function isBlank(bytes: Uint8Array): boolean {
  for (const b of bytes) if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false;
  return true;
}

/**
 * Which reader gets the file. Throws a StatementFileError for a file that is empty, too big, or
 * plainly something else (an image, a document, an archive), so it never reaches the CSV reader.
 */
export function fileKind(name: string, type: string, bytes: Uint8Array): FileKind {
  if (bytes.length > MAX_BYTES) throw new StatementFileError(FILE_MESSAGES.tooBig);
  if (isBlank(bytes)) throw new StatementFileError(FILE_MESSAGES.empty);
  const sig = binarySignature(bytes);
  // An image or archive can carry "%PDF-" in its metadata; only a file that is not one is a PDF.
  if (!sig && hasPdfHeader(bytes)) return 'pdf';
  const e = ext(name);
  // Text saved as UTF-16 (often a tab-separated export named .xls) is text, not a spreadsheet.
  const utf16 = startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff]);
  if (SPREADSHEET_EXT.has(e) && !utf16 && (sig || looksBinary(bytes)))
    throw new StatementFileError(FILE_MESSAGES.spreadsheet);
  if (sig || NOT_STATEMENT_EXT.has(e) || /^(image|audio|video|font|model)\//.test(type))
    throw new StatementFileError(FILE_MESSAGES.notStatement);
  // Named as a PDF but without the header: pdf.js still tries, since it can mend some damage.
  if (e === 'pdf' || type === 'application/pdf') return 'pdf';
  return 'text';
}

const SAMPLE = 64 * 1024;

/** True when more than one character in twenty is a control character or undecodable. */
function binaryShare(text: string): boolean {
  // Some exports pad their end with NUL bytes; that padding says nothing about the content.
  const s = text.replace(/\u0000+$/, '').slice(0, SAMPLE);
  if (!s.length) return false;
  const odd = s.match(CONTROL_CHARS)?.length ?? 0;
  const lost = s.match(/\uFFFD/g)?.length ?? 0;
  return (odd + lost) / s.length > 0.05;
}

function looksBinary(bytes: Uint8Array): boolean {
  return binaryShare(new TextDecoder('windows-1252').decode(bytes.subarray(0, SAMPLE)));
}

/**
 * Bytes to text: UTF-8 (with or without a byte-order mark), UTF-16 with a mark, or the Windows
 * Western encoding older bank exports use. A file that decodes to mostly control characters is
 * binary, not a statement; a stray one here and there is dropped by the CSV reader.
 */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  if (startsWith(bytes, [0xff, 0xfe])) text = new TextDecoder('utf-16le').decode(bytes);
  else if (startsWith(bytes, [0xfe, 0xff])) text = new TextDecoder('utf-16be').decode(bytes);
  else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
  }
  if (binaryShare(text)) throw new StatementFileError(FILE_MESSAGES.notStatement);
  if (
    !text
      .replace(CONTROL_CHARS, '')
      .replace(/^\uFEFF/, '')
      .trim()
  )
    throw new StatementFileError(FILE_MESSAGES.empty);
  return text;
}

/** The sentence to show when reading failed: Ballast's own words, never a library's. */
export function readFailure(err: unknown, kind: FileKind): string {
  // Ballast's own errors are already in plain words (a scanned page has no text, for one).
  if (err instanceof StatementFileError || err instanceof PdfNoTextError) return err.message;
  return kind === 'pdf' ? FILE_MESSAGES.damagedPdf : FILE_MESSAGES.unreadable;
}
