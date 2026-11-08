import {
  detectDateOrder,
  detectDecimal,
  looksLikeAmount,
  looksLikeDate,
  type DateOrder,
} from './values';

export type Role =
  | 'date'
  | 'valueDate'
  | 'description'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'balance'
  | 'currency'
  | 'reference'
  | 'type'
  | 'ignore';

export const ROLE_LABELS: Record<Role, string> = {
  date: 'Date',
  valueDate: 'Value date',
  description: 'Description',
  debit: 'Money out',
  credit: 'Money in',
  amount: 'Amount (signed)',
  balance: 'Balance',
  currency: 'Currency',
  reference: 'Reference',
  type: 'Debit or credit',
  ignore: 'Ignore',
};

/** Header words used by banks, NBK's layout first. Matched on whole normalised cell text. */
const SYNONYMS: [Role, string[]][] = [
  ['valueDate', ['value date', 'val date', 'value dt']],
  [
    'date',
    [
      'date',
      'transaction date',
      'posting date',
      'post date',
      'posted date',
      'txn date',
      'trans date',
      'tran date',
      'booking date',
      'entry date',
    ],
  ],
  [
    'description',
    [
      'description',
      'details',
      'transaction details',
      'narrative',
      'narration',
      'particulars',
      'remarks',
      'memo',
      'payee',
      'merchant',
      'transaction description',
      'name',
      'transaction',
    ],
  ],
  [
    'debit',
    [
      'debit',
      'debits',
      'withdrawal',
      'withdrawals',
      'money out',
      'paid out',
      'dr',
      'debit amount',
      'amount debit',
      'out',
    ],
  ],
  [
    'credit',
    [
      'credit',
      'credits',
      'deposit',
      'deposits',
      'money in',
      'paid in',
      'cr',
      'credit amount',
      'amount credit',
      'in',
    ],
  ],
  ['amount', ['amount', 'transaction amount', 'value', 'amount kwd', 'amount kd', 'amt']],
  [
    'balance',
    [
      'balance',
      'running balance',
      'available balance',
      'ledger balance',
      'balance kwd',
      'balance kd',
      'book balance',
    ],
  ],
  ['currency', ['currency', 'ccy', 'curr']],
  [
    'reference',
    [
      'reference',
      'ref',
      'ref no',
      'reference no',
      'reference number',
      'cheque no',
      'check no',
      'transaction id',
      'txn id',
      'doc no',
    ],
  ],
  ['type', ['type', 'dr cr', 'debit credit', 'transaction type', 'cr dr', 'd c']],
];

function normal(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The role a header cell names, or null. */
export function roleFor(cell: string): Role | null {
  const n = normal(cell);
  if (!n) return null;
  for (const [role, words] of SYNONYMS) if (words.includes(n)) return role;
  return null;
}

/** The index of the header row within the first 40 rows, or -1 when there is none. */
export function findHeader(rows: readonly string[][]): number {
  let best = -1;
  let bestHits = 1;
  rows.slice(0, 40).forEach((row, i) => {
    const roles = row.map(roleFor).filter(Boolean) as Role[];
    const distinct = new Set(roles).size;
    const hasDate = roles.includes('date') || roles.includes('valueDate');
    if (distinct > bestHits && hasDate) {
      best = i;
      bestHits = distinct;
    }
  });
  return best;
}

export interface Mapping {
  /** Header row index, or -1 when the data starts at the top. */
  header: number;
  columns: Role[];
  dateOrder: DateOrder;
  decimal: '.' | ',';
}

function column(rows: readonly string[][], i: number): string[] {
  return rows.map((r) => r[i] ?? '').filter((v) => v.trim() !== '');
}

function share(values: string[], test: (v: string) => boolean): number {
  return values.length ? values.filter(test).length / values.length : 0;
}

/**
 * Works out what each column holds: from the header words when there are any, then from the
 * values themselves for anything still unknown (dates, numbers, the longest text).
 */
export function detectMapping(rows: readonly string[][]): Mapping {
  const header = findHeader(rows);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const body = rows.slice(header + 1).filter((r) => r.some((c) => c.trim()));
  const columns: Role[] = Array<Role>(width).fill('ignore');
  const used = new Set<Role>();

  if (header >= 0) {
    rows[header]!.forEach((cell, i) => {
      const role = roleFor(cell);
      if (role && !used.has(role)) {
        columns[i] = role;
        used.add(role);
      }
    });
    // A lone "value date" with no posting date stands in as the date.
    if (!used.has('date') && used.has('valueDate')) {
      columns[columns.indexOf('valueDate')] = 'date';
      used.delete('valueDate');
      used.add('date');
    }
  }

  const free = () => columns.map((r, i) => (r === 'ignore' ? i : -1)).filter((i) => i >= 0);
  if (!used.has('date')) {
    const i = free().find((c) => share(column(body, c), looksLikeDate) > 0.6);
    if (i !== undefined) {
      columns[i] = 'date';
      used.add('date');
    }
  }
  const hasMoney = ['debit', 'credit', 'amount'].some((r) => used.has(r as Role));
  if (!hasMoney) {
    const numeric = free().filter((c) => {
      const vals = column(body, c);
      return (
        share(vals, looksLikeAmount) > 0.6 && share(vals, (v) => /[.,]\d{1,3}\b/.test(v)) > 0.3
      );
    });
    if (numeric.length >= 3) {
      const [d, c, b] = numeric.slice(-3) as [number, number, number];
      columns[d] = 'debit';
      columns[c] = 'credit';
      if (!used.has('balance')) columns[b] = 'balance';
    } else if (numeric.length === 2) {
      columns[numeric[0]!] = 'amount';
      if (!used.has('balance')) columns[numeric[1]!] = 'balance';
    } else if (numeric.length === 1) columns[numeric[0]!] = 'amount';
  }
  if (!columns.includes('description')) {
    let best = -1;
    let bestLen = 0;
    for (const c of free()) {
      const vals = column(body, c);
      if (share(vals, looksLikeAmount) > 0.5 || share(vals, looksLikeDate) > 0.5) continue;
      const len = vals.reduce((s, v) => s + v.length, 0) / Math.max(1, vals.length);
      if (len > bestLen) {
        best = c;
        bestLen = len;
      }
    }
    if (best >= 0) columns[best] = 'description';
  }

  const dateCol = columns.indexOf('date');
  const moneyCols = columns.flatMap((r, i) =>
    ['debit', 'credit', 'amount', 'balance'].includes(r) ? [i] : [],
  );
  return {
    header,
    columns,
    dateOrder: detectDateOrder(dateCol >= 0 ? column(body, dateCol) : []),
    decimal: detectDecimal(moneyCols.flatMap((c) => column(body, c))),
  };
}

/** What still blocks an import with this mapping, in plain words (empty when it is usable). */
export function mappingProblems(m: Mapping): string[] {
  const out: string[] = [];
  if (!m.columns.includes('date')) out.push('Choose the column that holds the date.');
  const money =
    m.columns.includes('amount') || m.columns.includes('debit') || m.columns.includes('credit');
  if (!money) out.push('Choose the amount column, or the money-in and money-out columns.');
  if (!m.columns.includes('description'))
    out.push('Choose the column that describes each transaction.');
  return out;
}
