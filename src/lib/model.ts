import type { ISODate } from './dates';
import type { Minor } from './money/money';

export type { ISODate, Minor };

export const SCHEMA_VERSION = 1;

export type AccountRole = 'spending' | 'savings' | 'other';

export interface Account {
  id: string;
  name: string;
  /** Savings feed the runway; spending receives the monthly salary. */
  role: AccountRole;
  currency: string;
  /** Balance before the first transaction, in the account's currency. */
  opening: Minor;
  openedOn: ISODate;
  archived?: boolean;
}

export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** OKLCH hue for the category's colour. */
  hue: number;
  icon: string;
  archived?: boolean;
}

export type TxnKind = 'expense' | 'income' | 'transfer';
export type TxnSource = 'manual' | 'import' | 'recurring' | 'salary' | 'demo';

export interface Txn {
  id: string;
  date: ISODate;
  kind: TxnKind;
  accountId: string;
  /** Always positive, in the account's currency. The kind gives the direction. */
  amount: Minor;
  /** The same value in the base currency at the time, used by every report. */
  base: Minor;
  categoryId?: string;
  payee: string;
  note?: string;
  /** Transfers: the receiving account and the amount it received in its own currency. */
  toAccountId?: string;
  toAmount?: Minor;
  /** A foreign-currency purchase as the merchant charged it ("12.99 USD"). */
  original?: { amount: Minor; currency: string };
  source: TxnSource;
  recurringId?: string;
  importId?: string;
  /** Import fingerprint, so the same statement row is never imported twice. */
  fingerprint?: string;
  createdAt: number;
}

export type Unit = 'week' | 'month' | 'year';

export interface Recurring {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  amount: Minor;
  accountId: string;
  categoryId?: string;
  every: number;
  unit: Unit;
  startOn: ISODate;
  endOn?: ISODate;
  /** Post a transaction automatically when it falls due. */
  autoPost: boolean;
  lastPostedOn?: ISODate;
}

export interface Budget {
  categoryId: string;
  /** Per money month, in the base currency. */
  amount: Minor;
  /** Unspent money carries into next month (and overspending is taken from it). */
  rollover: boolean;
  /** First month the budget counts from (start of a cycle). */
  since: ISODate;
}

export interface Salary {
  active: boolean;
  /** Paid to yourself on each payday, in the base currency. */
  amount: Minor;
  fromAccountId: string;
  toAccountId: string;
  autoPost: boolean;
  startedOn: ISODate;
  lastPostedOn?: ISODate;
}

export interface Target {
  date: ISODate;
  /** Never plan to go below this much in savings. */
  floor: Minor;
  label: string;
}

export interface Rule {
  id: string;
  /** Normalised merchant text to look for. */
  match: string;
  categoryId: string;
  /** Optional clean name to show instead of the raw statement text. */
  payee?: string;
  createdAt: number;
}

export interface ImportBatch {
  id: string;
  at: number;
  kind: 'pdf' | 'csv';
  profile: string;
  fileName: string;
  accountId: string;
  count: number;
  skipped: number;
  from: ISODate;
  to: ISODate;
  /** The statement's own closing balance, when it shows one. */
  closing?: Minor;
}

export interface Rate {
  /** Base currency per one unit of this currency, as a decimal string. */
  rate: string;
  on: ISODate;
}

export interface Settings {
  base: string;
  /** The day each money month starts: your payday (1 to 28). */
  cycleDay: number;
  name: string;
  onboarded: boolean;
  demo: boolean;
}

export interface LedgerData {
  version: number;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  recurring: Recurring[];
  budgets: Budget[];
  salary: Salary | null;
  target: Target | null;
  rules: Rule[];
  imports: ImportBatch[];
  rates: Record<string, Rate>;
  /** Insight ids the person dismissed. */
  dismissed: string[];
}
