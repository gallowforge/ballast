import type { Rule } from '../model';
import { cleanPayee, merchantKey } from './clean';

interface Known {
  re: RegExp;
  payee?: string;
  categoryId: string;
  /** Only for money out (expense) or money in (income). */
  dir?: 'out' | 'in';
}

/** Common merchants in Kuwait and online. A person's own rules always win over these. */
export const KNOWN: Known[] = [
  { re: /\bTALABAT\b/, payee: 'Talabat', categoryId: 'delivery' },
  { re: /\bDELIVEROO\b/, payee: 'Deliveroo', categoryId: 'delivery' },
  { re: /\bCARRIAGE\b/, payee: 'Carriage', categoryId: 'delivery' },
  { re: /\bJAHEZ\b/, payee: 'Jahez', categoryId: 'delivery' },
  { re: /\bKEETA\b/, payee: 'Keeta', categoryId: 'delivery' },
  { re: /\b(STARBUCKS)\b/, payee: 'Starbucks', categoryId: 'coffee' },
  { re: /\bCARIBOU\b/, payee: 'Caribou Coffee', categoryId: 'coffee' },
  { re: /\bTIM HORTONS?\b/, payee: 'Tim Hortons', categoryId: 'coffee' },
  { re: /\b(%|PERCENT)?\s*ARABICA\b/, payee: '% Arabica', categoryId: 'coffee' },
  { re: /\bCOFFEE|CAFE|ESPRESSO|ROASTER/, categoryId: 'coffee' },
  { re: /\bLULU\b/, payee: 'Lulu Hypermarket', categoryId: 'groceries' },
  { re: /\bCARREFOUR\b/, payee: 'Carrefour', categoryId: 'groceries' },
  { re: /\bSULTAN CENT(ER|RE)\b|\bTSC\b/, payee: 'The Sultan Center', categoryId: 'groceries' },
  { re: /\b(CO-?OP|COOPERATIVE|JAMEIA|JAMEYA)\b/, categoryId: 'groceries' },
  { re: /\bGEANT\b/, payee: 'Geant', categoryId: 'groceries' },
  { re: /\bCITY ?CENT(ER|RE)\b/, payee: 'City Centre', categoryId: 'groceries' },
  { re: /\bSUPERMARKET|HYPERMARKET|GROCER/, categoryId: 'groceries' },
  { re: /\bKNPC\b/, payee: 'KNPC', categoryId: 'fuel' },
  { re: /\bOULA\b/, payee: 'Oula', categoryId: 'fuel' },
  { re: /\bAL ?SOOR\b/, payee: 'Alsoor', categoryId: 'fuel' },
  { re: /\bFUEL|PETROL|GAS STATION\b/, categoryId: 'fuel' },
  { re: /\bCAREEM\b/, payee: 'Careem', categoryId: 'transport' },
  { re: /\bUBER\b/, payee: 'Uber', categoryId: 'transport' },
  { re: /\bPARKING|TAXI\b/, categoryId: 'transport' },
  { re: /\bZAIN\b/, payee: 'Zain', categoryId: 'bills' },
  { re: /\bOOREDOO\b/, payee: 'Ooredoo', categoryId: 'bills' },
  { re: /\bSTC\b|\bVIVA\b/, payee: 'stc', categoryId: 'bills' },
  { re: /\bNETFLIX\b/, payee: 'Netflix', categoryId: 'subscriptions' },
  { re: /\bSPOTIFY\b/, payee: 'Spotify', categoryId: 'subscriptions' },
  { re: /\bANGHAMI\b/, payee: 'Anghami', categoryId: 'subscriptions' },
  { re: /\bSHAHID\b/, payee: 'Shahid', categoryId: 'subscriptions' },
  { re: /\bOSN\b/, payee: 'OSN+', categoryId: 'subscriptions' },
  { re: /\bDISNEY\b/, payee: 'Disney+', categoryId: 'subscriptions' },
  { re: /\bYOUTUBE\b/, payee: 'YouTube', categoryId: 'subscriptions' },
  { re: /\bAPPLE\.?COM|ITUNES|APPLE SERVICES\b/, payee: 'Apple', categoryId: 'subscriptions' },
  { re: /\bGOOGLE\b/, payee: 'Google', categoryId: 'subscriptions' },
  { re: /\bPLAYSTATION|PSN|STEAM|XBOX|NINTENDO\b/, categoryId: 'fun' },
  { re: /\bAMAZON|AMZN\b/, payee: 'Amazon', categoryId: 'shopping' },
  { re: /\bNOON\b/, payee: 'noon', categoryId: 'shopping' },
  { re: /\bSHEIN\b/, payee: 'Shein', categoryId: 'shopping' },
  { re: /\bXCITE\b/, payee: 'Xcite', categoryId: 'shopping' },
  { re: /\bEUREKA\b/, payee: 'Eureka', categoryId: 'shopping' },
  { re: /\bIKEA\b/, payee: 'IKEA', categoryId: 'shopping' },
  { re: /\bZARA|H&M|H & M|CENTREPOINT|CENTERPOINT|MAX FASHION\b/, categoryId: 'shopping' },
  { re: /\bPHARMACY|CLINIC|HOSPITAL|DENTAL|MEDICAL|BOOTS\b/, categoryId: 'health' },
  { re: /\bGYM|FITNESS|OXYGEN|GOLD'?S\b/, categoryId: 'health' },
  { re: /\bCINEMA|CINESCAPE|VOX|GRAND CINEMAS\b/, categoryId: 'fun' },
  {
    re: /\bAIRWAYS|AIRLINES|JAZEERA|EMIRATES|QATAR AIR|FLYDUBAI|BOOKING\.COM|AIRBNB|HOTEL|EXPEDIA\b/,
    categoryId: 'travel',
  },
  { re: /\bUNIVERSITY|COURSERA|UDEMY|BOOKSTORE|JARIR\b/, categoryId: 'education' },
  {
    re: /\bMCDONALD|KFC|BURGER|PIZZA|SUBWAY|SHAWARMA|RESTAURANT|GRILL|KITCHEN|SHAKE SHACK|FIVE GUYS|P\.?F\.? CHANG|CHEESECAKE|APPLEBEE|TGI\b/,
    categoryId: 'eating-out',
  },
  { re: /\bATM\b|CASH WITHDRAWAL/, payee: 'Cash withdrawal', categoryId: 'cash', dir: 'out' },
  { re: /\b(FEE|FEES|CHARGE|CHARGES|COMMISSION)\b/, categoryId: 'fees', dir: 'out' },
  { re: /\b(SALARY|PAYROLL|WAGES)\b/, payee: 'Salary', categoryId: 'salary', dir: 'in' },
  {
    re: /\b(ALLOWANCE|STIPEND|MOHE|PAAET)\b/,
    payee: 'Allowance',
    categoryId: 'allowance',
    dir: 'in',
  },
  { re: /\b(REFUND|REVERSAL|CASHBACK|CASH BACK)\b/, categoryId: 'refunds', dir: 'in' },
  { re: /\b(UPWORK|FIVERR|PAYPAL|PAYONEER|WISE)\b/, categoryId: 'freelance', dir: 'in' },
];

/** Words that suggest money moving between your own accounts. */
export const TRANSFER_HINT = /\b(TRANSFER|TRF|TRFR|FUNDS? TRANSFER|OWN ACCOUNT|IBAN|INTERNAL)\b/;

export interface Guess {
  payee: string;
  categoryId?: string;
  /** The text looks like a transfer between your own accounts. */
  transfer: boolean;
  /** The rule that decided it, for "why this category?". */
  ruleId?: string;
}

/** Picks a payee name and category for a statement line: your rules first, then known merchants. */
export function categorize(raw: string, dir: 'out' | 'in', rules: readonly Rule[]): Guess {
  const key = merchantKey(raw);
  const upper = raw.toUpperCase();
  const clean = cleanPayee(raw);
  const transfer = TRANSFER_HINT.test(upper);
  const mine = [...rules]
    .sort((a, b) => b.match.length - a.match.length)
    .find((r) => r.match && key.includes(r.match));
  if (mine)
    return { payee: mine.payee || clean, categoryId: mine.categoryId, transfer, ruleId: mine.id };
  // Rules made for this direction (salary, refunds, cash) win over merchant names.
  const ordered = [...KNOWN.filter((k) => k.dir === dir), ...KNOWN.filter((k) => !k.dir)];
  for (const k of ordered) {
    if (k.re.test(upper))
      return { payee: k.payee ?? clean, categoryId: k.categoryId, transfer: false };
  }
  return { payee: clean, transfer };
}

/** A rule for this merchant, so the next statement sorts itself. */
export function ruleKey(raw: string): string {
  const key = merchantKey(raw);
  // Keep the first two words: "TALABAT KUWAIT" and "TALABAT GENERAL" share "TALABAT".
  return key.split(' ').slice(0, 2).join(' ');
}
