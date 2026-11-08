import { roleFor, type Role } from './detect';
import { looksLikeAmount, looksLikeDate } from './values';

/** A run of text on a PDF page, top-left origin, in PDF points. */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

export interface Cell {
  text: string;
  x0: number;
  x1: number;
}

export interface Line {
  page: number;
  y: number;
  h: number;
  cells: Cell[];
}

/** Groups text runs into lines (same baseline) and joins nearby runs into cells. */
export function groupLines(items: readonly TextItem[]): Line[] {
  const lines: Line[] = [];
  const pages = new Map<number, TextItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const list = pages.get(it.page) ?? [];
    list.push(it);
    pages.set(it.page, list);
  }
  for (const [page, list] of [...pages].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    let current: { y: number; h: number; items: TextItem[] } | null = null;
    const flush = () => {
      if (current) lines.push({ page, y: current.y, h: current.h, cells: toCells(current.items) });
    };
    for (const it of list) {
      const tol = Math.max(2, Math.min(it.h, current?.h ?? it.h) * 0.45);
      if (current && Math.abs(it.y - current.y) <= tol) current.items.push(it);
      else {
        flush();
        current = { y: it.y, h: it.h || 8, items: [it] };
      }
    }
    flush();
  }
  return lines;
}

function toCells(items: TextItem[]): Cell[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const cells: Cell[] = [];
  for (const it of sorted) {
    const charW = it.w / Math.max(1, it.str.length) || 4;
    const last = cells[cells.length - 1];
    const gap = last ? it.x - last.x1 : Infinity;
    if (last && gap < Math.max(2.5, charW * 1.3)) {
      last.text +=
        (gap > charW * 0.2 && !last.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') +
        it.str;
      last.x1 = Math.max(last.x1, it.x + it.w);
    } else cells.push({ text: it.str, x0: it.x, x1: it.x + it.w });
  }
  return cells
    .map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }))
    .filter((c) => c.text);
}

interface Column {
  role: Role;
  name: string;
  x0: number;
  x1: number;
}

const NUMERIC: Role[] = ['debit', 'credit', 'amount', 'balance'];
const FOOTER = /^(page\s*\d+(\s*(of|\/)\s*\d+)?|\d+\s*(of|\/)\s*\d+)$/i;

function headerColumns(line: Line): Column[] | null {
  const cols: Column[] = [];
  for (const cell of line.cells) {
    const role = roleFor(cell.text);
    if (role) cols.push({ role, name: cell.text, x0: cell.x0, x1: cell.x1 });
  }
  const roles = new Set(cols.map((c) => c.role));
  const hasDate = roles.has('date') || roles.has('valueDate');
  const hasMoney = NUMERIC.some((r) => roles.has(r));
  return roles.size >= 3 && hasDate && hasMoney ? cols : null;
}

function isHeaderRepeat(line: Line, header: Column[]): boolean {
  const roles = line.cells.map((c) => roleFor(c.text)).filter(Boolean);
  return roles.length >= Math.min(3, header.length);
}

/**
 * Rebuilds the transaction table from a statement's lines. With a header row, cells are placed
 * by their position under each heading: numbers by right edge (amounts are right-aligned), dates
 * by order, text into the description. Lines without a date continue the row above.
 */
export function linesToTable(lines: readonly Line[]): string[][] | null {
  let headerIdx = -1;
  let cols: Column[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    cols = headerColumns(lines[i]!);
    if (cols) {
      headerIdx = i;
      break;
    }
  }
  if (!cols) return clusterTable(lines);

  if (!cols.some((c) => c.role === 'description')) {
    // Give text a home: the gap after the last date column.
    const lastDate = Math.max(
      ...cols.filter((c) => c.role === 'date' || c.role === 'valueDate').map((c) => c.x1),
    );
    cols.push({ role: 'description', name: 'Description', x0: lastDate + 1, x1: lastDate + 2 });
  }
  cols.sort((a, b) => a.x0 - b.x0);
  const out: string[][] = [cols.map((c) => c.name)];
  const index = (role: Role) => cols!.findIndex((c) => c.role === role);
  const descIdx = index('description');
  const dateCols = cols
    .map((c, i) => (c.role === 'date' || c.role === 'valueDate' ? i : -1))
    .filter((i) => i >= 0);
  const numCols = cols.map((c, i) => (NUMERIC.includes(c.role) ? i : -1)).filter((i) => i >= 0);
  const refIdx = index('reference');
  const curIdx = index('currency');
  const firstNumX = Math.min(...numCols.map((i) => cols![i]!.x0));

  let row: string[] | null = null;
  let lastY = 0;
  let lastPage = -1;
  for (const line of lines.slice(headerIdx + 1)) {
    if (isHeaderRepeat(line, cols)) continue;
    const text = line.cells.map((c) => c.text).join(' ');
    if (FOOTER.test(text.trim())) continue;
    const cells: string[] = Array<string>(cols.length).fill('');
    let dates = 0;
    let numbers = 0;
    for (const cell of line.cells) {
      if (looksLikeDate(cell.text) && dates < dateCols.length && cell.x1 < firstNumX) {
        cells[dateCols[dates++]!] = cell.text;
        continue;
      }
      if (looksLikeAmount(cell.text) && /[.,]\d/.test(cell.text) && cell.x0 >= firstNumX - 40) {
        let best = numCols[0]!;
        let bestD = Infinity;
        for (const i of numCols) {
          const c = cols[i]!;
          const d = Math.min(
            Math.abs(cell.x1 - c.x1),
            Math.abs((cell.x0 + cell.x1) / 2 - (c.x0 + c.x1) / 2),
          );
          if (d < bestD) {
            best = i;
            bestD = d;
          }
        }
        cells[best] = cell.text;
        numbers++;
        continue;
      }
      const center = (cell.x0 + cell.x1) / 2;
      if (refIdx >= 0 && center >= cols[refIdx]!.x0 - 4 && center <= cols[refIdx]!.x1 + 30)
        cells[refIdx] = cell.text;
      else if (
        curIdx >= 0 &&
        /^[A-Z]{3}$/.test(cell.text) &&
        Math.abs(center - (cols[curIdx]!.x0 + cols[curIdx]!.x1) / 2) < 30
      )
        cells[curIdx] = cell.text;
      else cells[descIdx] = `${cells[descIdx]} ${cell.text}`.trim();
    }
    if (dates > 0) {
      row = cells;
      out.push(row);
    } else if (
      row &&
      numbers === 0 &&
      cells[descIdx] &&
      line.page === lastPage &&
      line.y - lastY < line.h * 2.6
    ) {
      row[descIdx] = `${row[descIdx]} ${cells[descIdx]}`.trim();
    } else if (numbers > 0 || cells[descIdx]) {
      // Opening and closing balance lines keep their place so the parser can read them.
      if (/balance|brought|carried/i.test(text)) out.push(cells);
      row = null;
    }
    lastY = line.y;
    lastPage = line.page;
  }
  return out.length > 1 ? out : null;
}

/**
 * No header row: keep lines that start with a date, put the text in a description, and sort the
 * numbers into columns by clustering their right edges across the whole statement.
 */
function clusterTable(lines: readonly Line[]): string[][] | null {
  const rows = lines.filter((l) => l.cells[0] && looksLikeDate(l.cells[0].text));
  if (rows.length < 2) return null;
  const edges: number[] = [];
  for (const l of rows)
    for (const c of l.cells.slice(1))
      if (looksLikeAmount(c.text) && /[.,]\d/.test(c.text)) edges.push(c.x1);
  edges.sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const e of edges) {
    const last = clusters[clusters.length - 1];
    if (last && e - last[last.length - 1]! < 18) last.push(e);
    else clusters.push([e]);
  }
  const centers = clusters
    .filter((c) => c.length >= Math.max(2, rows.length * 0.15))
    .map((c) => c.reduce((s, v) => s + v, 0) / c.length);
  if (!centers.length) return null;
  const names =
    centers.length >= 3
      ? [...centers.slice(0, -3).map(() => 'Amount'), 'Debit', 'Credit', 'Balance']
      : centers.length === 2
        ? ['Amount', 'Balance']
        : ['Amount'];
  const out: string[][] = [['Date', 'Description', ...names]];
  for (const l of rows) {
    const nums: string[] = Array<string>(centers.length).fill('');
    const text: string[] = [];
    for (const c of l.cells.slice(1)) {
      if (looksLikeAmount(c.text) && /[.,]\d/.test(c.text)) {
        let best = 0;
        centers.forEach((x, i) => {
          if (Math.abs(c.x1 - x) < Math.abs(c.x1 - centers[best]!)) best = i;
        });
        nums[best] = c.text;
      } else if (!looksLikeDate(c.text) || text.length) text.push(c.text);
    }
    out.push([l.cells[0]!.text, text.join(' '), ...nums]);
  }
  return out;
}

/** All the text of the first page, for recognising the bank. */
export function pageText(items: readonly TextItem[], page = 1): string {
  return groupLines(items.filter((i) => i.page === page))
    .map((l) => l.cells.map((c) => c.text).join(' '))
    .join('\n');
}
