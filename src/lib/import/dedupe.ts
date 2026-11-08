import { diffDays, type ISODate } from '../dates';
import { effectOn } from '../ledger';
import type { LedgerData, Txn } from '../model';

/** A stable key for one statement line in one account. */
export function fingerprint(
  accountId: string,
  date: ISODate,
  amount: number,
  description: string,
): string {
  const text = description
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40);
  return `${accountId}|${date}|${amount}|${text}`;
}

/** Numbers repeats inside one batch (two identical coffees on one day are both real). */
export function withOccurrence(keys: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((k) => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${k}#${n}`;
  });
}

export interface Duplicate {
  /** The very same statement line was imported before. */
  exact: boolean;
  /** An entry you added yourself (or an automatic one) that looks like this line. */
  match?: Txn;
}

/**
 * Compares incoming lines with what is already in the account. Exact repeats are found by
 * fingerprint; entries added by hand or posted automatically (salary, recurring) are matched by
 * amount and a date within three days, each existing entry claimed at most once.
 */
export function findDuplicates(
  data: LedgerData,
  accountId: string,
  rows: readonly { date: ISODate; amount: number; fingerprint: string }[],
): Duplicate[] {
  const known = new Set(data.txns.filter((t) => t.fingerprint).map((t) => t.fingerprint!));
  const candidates = data.txns.filter(
    (t) => !t.fingerprint && (t.accountId === accountId || t.toAccountId === accountId),
  );
  const claimed = new Set<string>();
  return rows.map((r) => {
    if (known.has(r.fingerprint)) return { exact: true };
    let best: Txn | undefined;
    let bestGap = Infinity;
    for (const t of candidates) {
      if (claimed.has(t.id) || effectOn(t, accountId) !== r.amount) continue;
      const gap = Math.abs(diffDays(t.date, r.date));
      if (gap <= 3 && gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    }
    if (best) {
      claimed.add(best.id);
      return { exact: false, match: best };
    }
    return { exact: false };
  });
}
