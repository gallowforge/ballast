/**
 * RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes, CRLF, a UTF-8 byte-order
 * mark, and the delimiter sniffed from the file (comma, semicolon, tab or pipe).
 */
const CANDIDATES = [',', ';', '\t', '|'] as const;

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === ch && !q) n++;
  }
  return n;
}

/** The delimiter that splits the first lines most consistently. */
export function sniffDelimiter(text: string): string {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 20);
  let best: string = ',';
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonzero = counts.filter((c) => c > 0);
    if (!nonzero.length) continue;
    const mode = [...nonzero].sort(
      (a, b) => nonzero.filter((x) => x === b).length - nonzero.filter((x) => x === a).length,
    )[0]!;
    const consistent = counts.filter((c) => c === mode).length;
    const score = consistent * 10 + mode;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export function parseCSV(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field.trim() === '') {
      field = '';
      q = true;
    } else if (c === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function quote(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Writes rows as CSV with CRLF line ends, quoting only where needed. */
export function toCSV(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
}
