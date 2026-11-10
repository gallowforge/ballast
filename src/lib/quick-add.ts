import { addDays, weekday, type ISODate } from './dates';
import { currency, isCurrency } from './money/currency';
import { parseMinor, type Minor } from './money/money';
import type { LedgerData } from './model';
import { categorize } from './import/categorize';
import { titleCase } from './import/clean';

export interface QuickAdd {
  amount: Minor;
  /** Set when the text named another currency ("12.99 usd"). */
  currency?: string;
  kind: 'expense' | 'income';
  payee: string;
  categoryId?: string;
  date: ISODate;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Codes whose money is written with a plain "$". */
const DOLLARS = new Set(['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'TWD', 'MXN', 'COP']);

/** The currency a symbol or everyday word means, for someone whose main currency is `base`. */
function currencyWord(word: string, base: string): string | undefined {
  switch (word) {
    case '$':
    case 'dollar':
    case 'dollars':
      return DOLLARS.has(base) ? base : 'USD';
    case '€':
    case 'euro':
    case 'euros':
      return 'EUR';
    case '£':
      return 'GBP';
    case '¥':
    case 'yen':
      return base === 'CNY' ? 'CNY' : 'JPY';
    case '₹':
      return 'INR';
    case '₩':
      return 'KRW';
    case 'kd':
      return 'KWD';
  }
  const code = word.toUpperCase();
  return /^[A-Z]{3}$/.test(code) && isCurrency(code) ? code : undefined;
}

/**
 * Reads a one-line entry: "4.50 coffee", "lunch 12.5 yesterday", "+250 freelance",
 * "€12.99 amazon fri", "30 eur museum". A leading + means money in. The words become the payee
 * and pick the category through your rules and known merchants.
 */
export function parseQuickAdd(text: string, data: LedgerData, today: ISODate): QuickAdd | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let amountText: string | null = null;
  let income = false;
  let code: string | undefined;
  let date = today;
  const words: string[] = [];
  const base = data.settings.base;
  for (const raw of tokens) {
    const t = raw.toLowerCase();
    // A currency symbol on its own before the amount ("$ 12 lunch", "kd 3.5 snacks").
    if (amountText === null && !code && /^([$€£¥₹₩]|kd)$/.test(t)) {
      code = currencyWord(t, base);
      continue;
    }
    // An amount, with a currency symbol before or after it, or a code stuck to it ("12.99usd").
    const num = /^([+-])?([$€£¥₹₩])?(\d[\d,]*(?:\.\d+)?|\.\d+)([$€£¥₹₩]|[a-z]{2,3})?$/.exec(t);
    if (num && amountText === null) {
      const named = num[2] ?? num[4];
      const namedCode = named ? currencyWord(named, base) : undefined;
      if (!named || namedCode) {
        income = num[1] === '+';
        amountText = num[3]!;
        code = namedCode ?? code;
        continue;
      }
    }
    // A currency named after the amount ("12.99 usd", "30 euros").
    if (amountText !== null && !code && t !== 'the') {
      const named = currencyWord(t, base);
      if (named) {
        code = named;
        continue;
      }
    }
    if (t === 'today') continue;
    if (t === 'yesterday') {
      date = addDays(today, -1);
      continue;
    }
    const dayIdx = DAYS.indexOf(t.slice(0, 3));
    if (
      dayIdx >= 0 &&
      /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/.test(t) &&
      DAYS[dayIdx] === t.slice(0, 3)
    ) {
      const back = (weekday(today) - dayIdx + 7) % 7;
      date = addDays(today, -back);
      continue;
    }
    if (t === 'in' || t === 'income') {
      income = true;
      continue;
    }
    words.push(raw);
  }
  if (amountText === null) return null;
  const exp = currency(code ?? base).exp;
  const amount =
    parseMinor(amountText, exp) ??
    parseMinor(Number(amountText.replace(/,/g, '')).toFixed(exp), exp);
  if (!amount || amount <= 0) return null;
  const phrase = words.join(' ');
  const kind = income ? 'income' : 'expense';
  let categoryId: string | undefined;
  let payee = phrase ? titleCase(phrase) : '';
  if (phrase) {
    const byName = data.categories.find(
      (c) => c.kind === kind && c.name.toLowerCase() === phrase.toLowerCase(),
    );
    if (byName) categoryId = byName.id;
    else {
      const guess = categorize(phrase, income ? 'in' : 'out', data.rules);
      if (data.categories.some((c) => c.id === guess.categoryId)) categoryId = guess.categoryId;
      payee = guess.payee;
    }
  }
  return {
    amount,
    currency: code && code !== base ? code : undefined,
    kind,
    payee,
    categoryId,
    date,
  };
}
