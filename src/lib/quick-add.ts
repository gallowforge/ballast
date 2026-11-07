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

/**
 * Reads a one-line entry: "3.750 talabat", "coffee 1.5 yesterday", "+250 freelance",
 * "12.99 usd amazon fri". A leading + means money in. The words become the payee and pick
 * the category through your rules and known merchants.
 */
export function parseQuickAdd(text: string, data: LedgerData, today: ISODate): QuickAdd | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let amountText: string | null = null;
  let income = false;
  let code: string | undefined;
  let date = today;
  const words: string[] = [];
  for (const raw of tokens) {
    const t = raw.toLowerCase();
    const num = /^([+-])?(\d[\d,]*(?:\.\d+)?|\.\d+)([a-z]{3})?$/.exec(t);
    if (num && amountText === null) {
      income = num[1] === '+';
      amountText = num[2]!;
      if (num[3] && isCurrency(num[3].toUpperCase())) code = num[3].toUpperCase();
      continue;
    }
    if (amountText !== null && !code && /^[a-z]{3}$/.test(t) && isCurrency(t.toUpperCase()) && t !== 'the') {
      code = t.toUpperCase();
      continue;
    }
    if (t === 'kd') continue;
    if (t === 'today') continue;
    if (t === 'yesterday') {
      date = addDays(today, -1);
      continue;
    }
    const dayIdx = DAYS.indexOf(t.slice(0, 3));
    if (dayIdx >= 0 && /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/.test(t) && DAYS[dayIdx] === t.slice(0, 3)) {
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
  const exp = currency(code ?? data.settings.base).exp;
  const amount = parseMinor(amountText, exp) ?? parseMinor(Number(amountText.replace(/,/g, '')).toFixed(exp), exp);
  if (!amount || amount <= 0) return null;
  const phrase = words.join(' ');
  const kind = income ? 'income' : 'expense';
  let categoryId: string | undefined;
  let payee = phrase ? titleCase(phrase) : '';
  if (phrase) {
    const byName = data.categories.find((c) => c.kind === kind && c.name.toLowerCase() === phrase.toLowerCase());
    if (byName) categoryId = byName.id;
    else {
      const guess = categorize(phrase, income ? 'in' : 'out', data.rules);
      categoryId = guess.categoryId;
      payee = guess.payee;
    }
  }
  return { amount, currency: code && code !== data.settings.base ? code : undefined, kind, payee, categoryId, date };
}
