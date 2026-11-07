import type { ISODate } from '../dates';
import { currency } from '../money/currency';
import type { LedgerData, Txn, TxnKind } from '../model';
import { categorize } from './categorize';
import { parseCSV } from './csv';
import { findDuplicates, fingerprint, withOccurrence, type Duplicate } from './dedupe';
import { detectMapping, type Mapping } from './detect';
import { groupLines, linesToTable, pageText, type TextItem } from './pdf-layout';
import { detectCurrency, detectProfile, GENERIC, type Profile } from './profiles';
import { parseStatement, type ParsedStatement } from './statement';

export interface Source {
  kind: 'csv' | 'pdf';
  fileName: string;
  table: string[][];
  profile: Profile;
  /** Statement currency as the file states it (falls back to the profile's). */
  currency: string;
}

export function sourceFromCSV(text: string, fileName: string): Source {
  const table = parseCSV(text);
  const head = table.slice(0, 12).map((r) => r.join(' ')).join('\n');
  const profile = detectProfile(head);
  return { kind: 'csv', fileName, table, profile, currency: detectCurrency(head, profile.currency) };
}

export function sourceFromPdf(items: readonly TextItem[], fileName: string): Source | null {
  const text = pageText(items, 1);
  const profile = detectProfile(text);
  const table = linesToTable(groupLines(items));
  if (!table) return null;
  return { kind: 'pdf', fileName, table, profile, currency: detectCurrency(text, profile.currency) };
}

export function mappingFor(source: Source): Mapping {
  return detectMapping(source.table);
}

export function readStatement(source: Source, mapping: Mapping, accountCurrency: string, invert = false): ParsedStatement {
  return parseStatement(source.table, mapping, { exp: currency(accountCurrency).exp, invert });
}

export interface ReviewRow {
  key: string;
  line: number;
  date: ISODate;
  raw: string;
  /** Signed minor units in the account's currency. */
  amount: number;
  balance?: number;
  payee: string;
  categoryId?: string;
  kind: TxnKind;
  toAccountId?: string;
  include: boolean;
  duplicate: Duplicate;
  fingerprint: string;
  transferHint: boolean;
}

/** Everything the review screen needs: a clean payee, a category guess and duplicate checks. */
export function buildReview(data: LedgerData, accountId: string, statement: ParsedStatement): ReviewRow[] {
  const keys = withOccurrence(statement.rows.map((r) => fingerprint(accountId, r.date, r.amount, r.description)));
  const dups = findDuplicates(
    data,
    accountId,
    statement.rows.map((r, i) => ({ date: r.date, amount: r.amount, fingerprint: keys[i]! })),
  );
  return statement.rows.map((r, i) => {
    const dir = r.amount < 0 ? 'out' : 'in';
    const guess = categorize(r.description, dir, data.rules);
    const dup = dups[i]!;
    const matchedTransfer = dup.match?.kind === 'transfer';
    return {
      key: keys[i]!,
      line: r.line,
      date: r.date,
      raw: r.description,
      amount: r.amount,
      balance: r.balance,
      payee: guess.payee,
      categoryId: guess.categoryId,
      kind: matchedTransfer ? 'transfer' : r.amount < 0 ? 'expense' : 'income',
      include: !dup.exact && !dup.match,
      duplicate: dup,
      fingerprint: keys[i]!,
      transferHint: guess.transfer,
    };
  });
}

export interface ImportSummary {
  count: number;
  out: number;
  in: number;
  duplicates: number;
  uncategorised: number;
}

export function summarize(rows: readonly ReviewRow[]): ImportSummary {
  const kept = rows.filter((r) => r.include);
  return {
    count: kept.length,
    out: kept.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0),
    in: kept.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0),
    duplicates: rows.filter((r) => r.duplicate.exact || r.duplicate.match).length,
    uncategorised: kept.filter((r) => r.kind !== 'transfer' && !r.categoryId).length,
  };
}

/** True when an account already holds entries dated before the statement starts. */
export function hasHistoryBefore(data: LedgerData, accountId: string, from: ISODate): boolean {
  return data.txns.some((t: Txn) => (t.accountId === accountId || t.toAccountId === accountId) && t.date < from);
}
