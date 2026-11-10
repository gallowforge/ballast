import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findDuplicates, fingerprint, withOccurrence } from '../import/dedupe';
import {
  buildReview,
  hasHistoryBefore,
  mappingFor,
  readStatement,
  sourceFromCSV,
  summarize,
} from '../import/importer';
import { detectCurrency, detectProfile } from '../import/profiles';
import { applyImport, undoImport } from '../store/ops';
import { balance } from '../ledger';
import { data, savings, spending, txn } from './fixtures';

const csv = readFileSync('tests/fixtures/sample-statement.csv', 'utf8');
const expected = JSON.parse(readFileSync('tests/fixtures/sample-statement.json', 'utf8'));

describe('bank profiles', () => {
  it('recognises a known bank layout from the statement text', () => {
    expect(detectProfile('National Bank of Kuwait\nStatement of Account')).toMatchObject({
      id: 'nbk',
      currency: 'KWD',
    });
    expect(detectProfile('www.nbk.com').id).toBe('nbk');
    expect(detectProfile('Example Bank').id).toBe('generic');
    expect(detectProfile('Example Bank').currency).toBeUndefined();
  });
  it('reads the statement currency, and leaves it unknown when the text does not say', () => {
    expect(detectCurrency('Account currency: EUR', 'USD')).toBe('EUR');
    expect(detectCurrency('Currency: GBP')).toBe('GBP');
    expect(detectCurrency('nothing here', 'KWD')).toBe('KWD');
    expect(detectCurrency('nothing here')).toBeUndefined();
    // Three letters that are not a currency Ballast knows are not taken for one.
    expect(detectCurrency('Currency: ALL accounts')).toBeUndefined();
  });
  it('takes the currency from the file, or leaves it to the account', () => {
    expect(sourceFromCSV(csv, 'sample-statement.csv').currency).toBeUndefined();
    const named = sourceFromCSV(`Currency: EUR\n${csv}`, 'x.csv');
    expect(named.currency).toBe('EUR');
  });
});

describe('duplicates', () => {
  it('numbers identical lines within one statement', () => {
    expect(withOccurrence(['a', 'b', 'a'])).toEqual(['a#1', 'b#1', 'a#2']);
  });
  it('builds a stable fingerprint', () => {
    expect(fingerprint('cur', '2026-11-02', -4250, 'Pos Uber *Eats, NL')).toBe(
      'cur|2026-11-02|-4250|POSUBEREATSNL',
    );
  });
  it('finds exact repeats and entries added by hand, claiming each once', () => {
    const d = data({
      accounts: [savings, spending],
      txns: [
        txn({ date: '2026-11-02', amount: 4250, fingerprint: 'k1#1' }),
        txn({ id: 'manual', date: '2026-11-04', amount: 1500 }),
        txn({
          id: 'salary',
          date: '2026-11-01',
          amount: 200000,
          kind: 'transfer',
          accountId: 'sav',
          toAccountId: 'cur',
        }),
      ],
    });
    const dups = findDuplicates(d, 'cur', [
      { date: '2026-11-02', amount: -4250, fingerprint: 'k1#1' },
      { date: '2026-11-03', amount: -1500, fingerprint: 'k2#1' },
      { date: '2026-11-03', amount: -1500, fingerprint: 'k2#2' },
      { date: '2026-11-01', amount: 200000, fingerprint: 'k3#1' },
      { date: '2026-11-20', amount: -1500, fingerprint: 'k4#1' },
    ]);
    expect(dups.map((x) => (x.exact ? 'exact' : (x.match?.id ?? 'new')))).toEqual([
      'exact',
      'manual',
      'new',
      'salary',
      'new',
    ]);
  });
});

describe('importing the sample CSV', () => {
  const source = sourceFromCSV(csv, 'sample-statement.csv');
  const mapping = mappingFor(source);
  const statement = readStatement(source, mapping, 'USD');

  it('reads and reconciles it', () => {
    expect(statement.rows).toHaveLength(expected.rows);
    expect(statement.reconciliation).toMatchObject({
      mismatched: [],
      opening: expected.opening,
      closing: expected.closing,
    });
  });

  it('cleans payees, guesses categories and skips the salary already posted', () => {
    const d = data({
      accounts: [savings, spending],
      salary: {
        active: true,
        amount: 310_000,
        fromAccountId: 'sav',
        toAccountId: 'cur',
        autoPost: true,
        startedOn: '2026-10-01',
      },
      txns: [
        txn({
          id: 'pay',
          date: '2026-10-01',
          amount: 310_000,
          kind: 'transfer',
          accountId: 'sav',
          toAccountId: 'cur',
          source: 'salary',
        }),
      ],
    });
    const rows = buildReview(d, 'cur', statement);
    const first = rows[0]!;
    expect(first).toMatchObject({ kind: 'transfer', include: false, transferHint: true });
    expect(first.duplicate.match?.id).toBe('pay');
    const delivery = rows.find((r) => r.raw.includes('UBER *EATS'))!;
    expect(delivery).toMatchObject({
      payee: 'Uber Eats',
      categoryId: 'delivery',
      kind: 'expense',
      include: true,
    });
    expect(rows.find((r) => r.raw.includes('RENT'))).toMatchObject({
      categoryId: 'home',
      amount: -135_000,
    });
    const s = summarize(rows);
    expect(s.count).toBe(expected.rows - 1);
    expect(s.duplicates).toBe(1);
    expect(s.out).toBe(expected.debit);
  });

  it('leaves out guesses for categories this money life does not have', () => {
    const d = data({
      accounts: [savings, spending],
      categories: data().categories.filter((c) => c.id !== 'home'),
    });
    const rent = buildReview(d, 'cur', statement).find((r) => r.raw.includes('RENT'))!;
    expect(rent.categoryId).toBeUndefined();
  });

  it('commits, matches the bank to the cent, and undoes cleanly', () => {
    const d = data({ accounts: [savings, { ...spending, opening: 0 }] });
    const rows = buildReview(d, 'cur', statement);
    const { op, id } = applyImport(rows, {
      kind: 'csv',
      profile: 'generic',
      fileName: 'sample-statement.csv',
      accountId: 'cur',
      from: statement.from!,
      to: statement.to!,
      closing: statement.reconciliation.closing,
      opening: { amount: statement.reconciliation.opening!, on: statement.from! },
    });
    const after = op(d);
    expect(after.txns).toHaveLength(expected.rows);
    expect(after.imports[0]).toMatchObject({ id, count: expected.rows, skipped: 0 });
    expect(balance(after, 'cur')).toBe(expected.closing);
    expect(after.txns.every((t) => t.source === 'import' && t.fingerprint)).toBe(true);
    // Importing the same file again finds every line already there.
    const again = buildReview(after, 'cur', statement);
    expect(again.every((r) => r.duplicate.exact && !r.include)).toBe(true);
    const undone = undoImport(id)(after);
    expect(undone.txns).toHaveLength(0);
    expect(undone.imports).toHaveLength(0);
  });

  it('can record a line as a transfer to another account', () => {
    const d = data({ accounts: [savings, spending] });
    const rows = buildReview(d, 'cur', statement).map((r, i) =>
      i === 0 ? { ...r, kind: 'transfer' as const, toAccountId: 'sav', include: true } : r,
    );
    const after = applyImport(rows, {
      kind: 'csv',
      profile: 'generic',
      fileName: 'x',
      accountId: 'cur',
      from: '2026-10-01',
      to: '2026-10-31',
    }).op(d);
    const t = after.txns[0]!;
    // Money came in to the current account from savings.
    expect(t).toMatchObject({
      kind: 'transfer',
      accountId: 'sav',
      toAccountId: 'cur',
      amount: 310_000,
    });
  });

  it('knows when an account already has older history', () => {
    const d = data({ accounts: [spending], txns: [txn({ date: '2026-09-01', amount: 1 })] });
    expect(hasHistoryBefore(d, 'cur', '2026-10-01')).toBe(true);
    expect(hasHistoryBefore(d, 'cur', '2026-08-01')).toBe(false);
  });
});

describe('undo and transfers', () => {
  it('undoing an import gives the account back its old starting balance', () => {
    const source = sourceFromCSV(csv, 'sample-statement.csv');
    const statement = readStatement(source, mappingFor(source), 'USD');
    const d = data({
      accounts: [savings, { ...spending, opening: 12_345, openedOn: '2026-01-01' }],
    });
    const rows = buildReview(d, 'cur', statement);
    const { op, id } = applyImport(rows, {
      kind: 'csv',
      profile: 'generic',
      fileName: 'x',
      accountId: 'cur',
      from: statement.from!,
      to: statement.to!,
      opening: { amount: statement.reconciliation.opening!, on: statement.from! },
    });
    const after = op(d);
    expect(after.accounts.find((a) => a.id === 'cur')!.opening).toBe(expected.opening);
    const undone = undoImport(id)(after);
    expect(undone.accounts.find((a) => a.id === 'cur')).toMatchObject({
      opening: 12_345,
      openedOn: '2026-01-01',
    });
  });

  it('money in from an account in another currency is converted on the sending side', () => {
    const wallet = {
      id: 'eur',
      name: 'Wallet',
      role: 'other' as const,
      currency: 'EUR',
      opening: 0,
      openedOn: '2026-01-01',
    };
    const d = data({
      accounts: [savings, spending, wallet],
      rates: { EUR: { rate: '1.1', on: '2026-11-01' } },
    });
    const row = {
      key: 'k',
      line: 2,
      date: '2026-11-02',
      raw: 'TRANSFER FROM WALLET',
      amount: 11_000,
      payee: 'Transfer',
      kind: 'transfer' as const,
      toAccountId: 'eur',
      include: true,
      duplicate: { exact: false },
      fingerprint: 'f',
      transferHint: true,
    };
    const t = applyImport([row], {
      kind: 'csv',
      profile: 'generic',
      fileName: 'x',
      accountId: 'cur',
      from: '2026-11-02',
      to: '2026-11-02',
    }).op(d).txns[0]!;
    expect(t).toMatchObject({
      kind: 'transfer',
      accountId: 'eur',
      toAccountId: 'cur',
      amount: 10_000,
      toAmount: 11_000,
      base: 11_000,
    });
  });
});
