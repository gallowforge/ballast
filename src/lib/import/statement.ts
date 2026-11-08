import type { ISODate } from '../dates';
import type { Mapping } from './detect';
import { parseAmount, parseDate } from './values';

export interface StatementRow {
  /** Row number in the source table (1-based), for messages. */
  line: number;
  date: ISODate;
  description: string;
  /** Signed minor units: negative is money out. */
  amount: number;
  balance?: number;
  currency?: string;
  reference?: string;
}

export interface Reconciliation {
  /** Rows whose running balance could be checked. */
  checked: number;
  matched: number;
  /** Lines whose balance does not follow from the previous row. */
  mismatched: number[];
  /** Balance before the first row (from an opening-balance line, or worked out). */
  opening?: number;
  /** Balance after the last row. */
  closing?: number;
  /** Signs that were worked out from the running balance. */
  inferred: number;
  /** Lines whose direction could not be checked (the first row with no opening balance). */
  unverified: number[];
}

export interface ParsedStatement {
  rows: StatementRow[];
  skipped: { line: number; reason: string }[];
  reconciliation: Reconciliation;
  from?: ISODate;
  to?: ISODate;
  /** The statement lists newest first. */
  descending: boolean;
}

const OPENING =
  /\b(opening balance|balance brought forward|brought forward|b\/f|previous balance|balance b\/fwd|start balance)\b/i;
const CLOSING =
  /\b(closing balance|balance carried forward|carried forward|c\/f|ending balance|end balance)\b/i;
const TOTAL = /^\s*(total|totals|sub ?total|grand total)\b/i;
const CREDIT_WORDS = /\b(salary|payroll|deposit|refund|reversal|credit|transfer from|received|cash in|interest)\b/i;

export interface ParseOptions {
  /** Minor-unit digits of the statement currency (3 for KWD). */
  exp: number;
  /** Flip every sign (for exports that show spending as positive). */
  invert?: boolean;
}

/** Turns a mapped table into dated, signed rows and checks them against the running balance. */
export function parseStatement(
  table: readonly string[][],
  mapping: Mapping,
  opts: ParseOptions,
): ParsedStatement {
  const col = (role: string) => mapping.columns.indexOf(role as Mapping['columns'][number]);
  const c = {
    date: col('date'),
    desc: col('description'),
    debit: col('debit'),
    credit: col('credit'),
    amount: col('amount'),
    balance: col('balance'),
    currency: col('currency'),
    reference: col('reference'),
    type: col('type'),
  };
  const cell = (r: readonly string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const amt = (s: string) => (s ? parseAmount(s, opts.exp, mapping.decimal) : null);

  const rows: (StatementRow & { signed: boolean; hasAmount: boolean })[] = [];
  const skipped: ParsedStatement['skipped'] = [];
  let opening: number | undefined;
  let closing: number | undefined;
  let anySigned = false;

  table.forEach((r, idx) => {
    if (idx <= mapping.header) return;
    const line = idx + 1;
    if (!r.some((v) => v.trim())) return;
    const text = r.join(' ');
    const desc = cell(r, c.desc);
    const bal = amt(cell(r, c.balance))?.minor;
    const date = parseDate(cell(r, c.date), mapping.dateOrder);

    if (OPENING.test(desc) || (!date && OPENING.test(text))) {
      opening = bal ?? amt(cell(r, c.amount))?.minor ?? amt(cell(r, c.credit))?.minor ?? opening;
      return;
    }
    if (CLOSING.test(desc) || (!date && CLOSING.test(text))) {
      closing = bal ?? amt(cell(r, c.amount))?.minor ?? closing;
      return;
    }
    if (!date) {
      if (TOTAL.test(text)) return;
      const prev = rows[rows.length - 1];
      const onlyText =
        desc && [c.debit, c.credit, c.amount, c.balance].every((i) => !amt(cell(r, i)));
      if (prev && onlyText) prev.description = `${prev.description} ${desc}`.trim();
      else skipped.push({ line, reason: 'No date' });
      return;
    }

    let amount: number | null = null;
    let signed = false;
    if (c.debit >= 0 || c.credit >= 0) {
      const d = amt(cell(r, c.debit));
      const cr = amt(cell(r, c.credit));
      if (d || cr) {
        amount = Math.abs(cr?.minor ?? 0) - Math.abs(d?.minor ?? 0);
        signed = true;
      }
    }
    if (amount === null && c.amount >= 0) {
      const a = amt(cell(r, c.amount));
      if (a) {
        amount = a.minor;
        signed = a.signed;
        const type = cell(r, c.type).toLowerCase();
        if (type) {
          signed = true;
          amount = /^(d|dr|debit|withdrawal|out)/.test(type)
            ? -Math.abs(a.minor)
            : Math.abs(a.minor);
        }
      }
    }
    if (amount === null && bal === undefined) {
      skipped.push({ line, reason: 'No amount' });
      return;
    }
    if (amount === 0) {
      skipped.push({ line, reason: 'Zero amount' });
      return;
    }
    if (signed) anySigned = true;
    rows.push({
      line,
      date,
      description: desc.replace(/\s+/g, ' '),
      amount: amount ?? 0,
      balance: bal,
      currency: cell(r, c.currency) || undefined,
      reference: cell(r, c.reference) || undefined,
      signed,
      hasAmount: amount !== null,
    });
  });

  // Newest-first statements are walked oldest-first (stable for rows on the same day).
  const descending = isDescending(rows.map((r) => r.date));
  const ordered = descending ? [...rows].reverse() : rows;

  let checked = 0;
  let matched = 0;
  let inferred = 0;
  const mismatched: number[] = [];
  const unverified: number[] = [];
  let prev: number | undefined = opening;
  for (const r of ordered) {
    if (r.balance !== undefined && prev !== undefined) {
      const delta = r.balance - prev;
      if (!r.hasAmount || (!r.signed && !anySigned && Math.abs(delta) === Math.abs(r.amount))) {
        // Unsigned amounts (or none at all): the running balance says which way the money went.
        if (r.amount !== delta) inferred++;
        r.amount = delta;
      } else if (!r.signed && Math.abs(delta) === Math.abs(r.amount)) {
        if (r.amount !== delta) inferred++;
        r.amount = delta;
      }
      checked++;
      if (r.amount === delta) matched++;
      else mismatched.push(r.line);
    } else if (r.balance !== undefined && prev === undefined && r.hasAmount) {
      if (!r.signed && !anySigned) {
        // No opening balance to check against, so the first row's direction is a best guess
        // (money out, unless the words say otherwise). It is reported as unverified.
        r.amount = CREDIT_WORDS.test(r.description) ? Math.abs(r.amount) : -Math.abs(r.amount);
        unverified.push(r.line);
      }
      opening = r.balance - r.amount;
    }
    if (r.balance !== undefined) prev = r.balance;
    else if (prev !== undefined) prev += r.amount;
  }
  if (opening === undefined) {
    const first = ordered.find((r) => r.balance !== undefined);
    if (first) opening = first.balance! - first.amount;
  }
  const lastBal = [...ordered].reverse().find((r) => r.balance !== undefined)?.balance;
  if (closing === undefined && lastBal !== undefined) {
    const lastIdx = ordered.findLastIndex((r) => r.balance !== undefined);
    closing = lastBal + ordered.slice(lastIdx + 1).reduce((s, r) => s + r.amount, 0);
  }

  if (opts.invert) for (const r of ordered) r.amount = -r.amount;
  const clean: StatementRow[] = ordered
    .filter((r) => r.amount !== 0)
    .map(({ signed: _s, hasAmount: _h, ...r }) => r);
  return {
    rows: clean,
    skipped,
    reconciliation: { checked, matched, mismatched, opening, closing, inferred, unverified },
    from: clean[0]?.date,
    to: clean[clean.length - 1]?.date,
    descending,
  };
}

function isDescending(dates: string[]): boolean {
  let up = 0;
  let down = 0;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i]! > dates[i - 1]!) up++;
    else if (dates[i]! < dates[i - 1]!) down++;
  }
  return down > up;
}
