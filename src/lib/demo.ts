/**
 * A believable, entirely made-up money life for trying Ledger: "Alex", a student living on a
 * monthly salary drawn from savings, with some freelance income in dollars. Everything is relative
 * to today and generated from a fixed seed, so it is the same on every device and never stale.
 */
import { addDays, addMonths, cycleOf, dayInMonth, parts, type ISODate } from './dates';
import { emptyData } from './defaults';
import { seeded } from './ids';
import { convert } from './money/fx';
import type { LedgerData, Recurring, Txn } from './model';
import { occurrences } from './calc/recurring';
import { paydays } from './calc/cycle';

const USD_RATE = '0.3071';

export function buildDemo(today: ISODate): LedgerData {
  const rnd = seeded(7311);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  /** A random price between lo and hi (major units), rounded to `step` fils. */
  const price = (lo: number, hi: number, step = 50) => Math.round(((lo + rnd() * (hi - lo)) * 1000) / step) * step;

  const d = emptyData();
  const current = cycleOf(today, 1);
  const start = addMonths(current.start, -5);
  d.settings = { base: 'KWD', cycleDay: 1, name: 'Alex', onboarded: true, demo: true };
  d.rates = { USD: { rate: USD_RATE, on: today } };
  d.accounts = [
    { id: 'a_savings', name: 'Savings', role: 'savings', currency: 'KWD', opening: 5_420_000, openedOn: start },
    { id: 'a_current', name: 'Current account', role: 'spending', currency: 'KWD', opening: 38_250, openedOn: start },
    { id: 'a_wallet', name: 'Freelance wallet', role: 'other', currency: 'USD', opening: 0, openedOn: start },
  ];

  const txns: Txn[] = [];
  let n = 0;
  const add = (t: Omit<Txn, 'id' | 'createdAt' | 'base' | 'source'> & { base?: number; source?: Txn['source'] }) => {
    const base = t.base ?? t.amount;
    txns.push({ source: 'demo', ...t, base, id: `demo_${++n}`, createdAt: n });
  };

  // Pay yourself: a salary from savings on the 1st of every month.
  d.salary = {
    active: true,
    amount: 220_000,
    fromAccountId: 'a_savings',
    toAccountId: 'a_current',
    autoPost: true,
    startedOn: start,
  };
  const days = paydays(d.salary, 1, start, today);
  for (const date of days)
    add({ date, kind: 'transfer', accountId: 'a_savings', toAccountId: 'a_current', amount: 220_000, toAmount: 220_000, payee: 'Salary', note: 'Paid to yourself from savings', source: 'salary' });
  d.salary.lastPostedOn = days[days.length - 1];

  const { y, m } = parts(start);
  const on = (day: number) => dayInMonth(y, m, day);
  const recurring: Recurring[] = [
    { id: 'r_gym', name: 'Gym membership', kind: 'expense', amount: 18_000, accountId: 'a_current', categoryId: 'health', every: 1, unit: 'month', startOn: on(3), autoPost: true },
    { id: 'r_phone', name: 'stc', kind: 'expense', amount: 8_500, accountId: 'a_current', categoryId: 'bills', every: 1, unit: 'month', startOn: on(6), autoPost: true },
    { id: 'r_spotify', name: 'Spotify', kind: 'expense', amount: 1_990, accountId: 'a_current', categoryId: 'subscriptions', every: 1, unit: 'month', startOn: on(9), autoPost: true },
    { id: 'r_netflix', name: 'Netflix', kind: 'expense', amount: 3_500, accountId: 'a_current', categoryId: 'subscriptions', every: 1, unit: 'month', startOn: on(15), autoPost: true },
    { id: 'r_cloud', name: 'Cloud storage', kind: 'expense', amount: 990, accountId: 'a_current', categoryId: 'subscriptions', every: 1, unit: 'month', startOn: on(21), autoPost: true },
    { id: 'r_insurance', name: 'Car insurance', kind: 'expense', amount: 96_000, accountId: 'a_savings', categoryId: 'travel', every: 1, unit: 'year', startOn: addMonths(current.start, 3), autoPost: true },
    { id: 'r_job', name: 'Part-time job', kind: 'income', amount: 120_000, accountId: 'a_savings', categoryId: 'salary', every: 1, unit: 'month', startOn: addDays(addMonths(current.start, 10), 24), autoPost: true },
  ];
  for (const r of recurring) {
    const past = occurrences(r, r.startOn, today);
    for (const date of past) add({ date, kind: r.kind, accountId: r.accountId, amount: r.amount, categoryId: r.categoryId, payee: r.name, recurringId: r.id, source: 'recurring' });
    if (past.length) r.lastPostedOn = past[past.length - 1];
  }
  d.recurring = recurring;

  // Everyday spending from the current account.
  const usd = (cents: number) => convert(cents, 'USD', 'KWD', USD_RATE)!;
  let lastFuel = start;
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const spend = (payee: string, categoryId: string | undefined, amount: number) =>
      add({ date, kind: 'expense', accountId: 'a_current', amount, categoryId, payee });
    if (rnd() < 0.33) spend(pick(['Starbucks', 'Caribou Coffee', '% Arabica', 'Starbucks']), 'coffee', price(1.25, 2.5, 250));
    if (rnd() < 0.15) spend('Talabat', 'delivery', price(2.75, 7.9));
    if (wd === 5 && rnd() < 0.9) spend(pick(['Lulu Hypermarket', 'Carrefour', 'The Sultan Center']), 'groceries', price(7, 17));
    else if (rnd() < 0.06) spend('Co-op', 'groceries', price(1.5, 5));
    if (addDays(lastFuel, 6 + Math.floor(rnd() * 3)) <= date) {
      spend(pick(['KNPC', 'Oula', 'Alsoor']), 'fuel', price(4, 6.25, 250));
      lastFuel = date;
    }
    if (rnd() < 0.06) spend(pick(['Shake Shack', 'Mais Alghanim', 'P.F. Chang’s', 'Burger Boutique', 'Slider Station']), 'eating-out', price(4.5, 13.5));
    if (rnd() < 0.05) spend('Careem', 'transport', price(1.8, 4.2));
    if (rnd() < 0.035) {
      const cents = Math.round((12 + rnd() * 30) * 100);
      add({ date, kind: 'expense', accountId: 'a_current', amount: usd(cents), categoryId: 'shopping', payee: 'Amazon', original: { amount: cents, currency: 'USD' } });
    }
    if (rnd() < 0.015) spend(pick(['Xcite', 'Zara', 'IKEA']), 'shopping', price(6, 34));
    if (rnd() < 0.04) spend(pick(['Cinescape', 'Cinescape', 'Bowling City']), 'fun', price(3.5, 6.5, 500));
    if (rnd() < 0.015) spend('Pharmacy', 'health', price(1.75, 5.5));
    if (rnd() < 0.015) spend(pick(['Flower shop', 'Gift for Sam']), 'gifts', price(5, 14));
  }

  // Freelance work, paid in dollars into a dollar wallet, partly moved to savings.
  const gigs = [
    [24, 42_000],
    [71, 65_000],
    [118, 38_000],
  ] as const;
  for (const [offset, cents] of gigs) {
    const date = addDays(start, offset);
    if (date > today) continue;
    add({ date, kind: 'income', accountId: 'a_wallet', amount: cents, base: usd(cents), categoryId: 'freelance', payee: 'Upwork' });
  }
  const move = addDays(start, 75);
  if (move <= today)
    add({ date: move, kind: 'transfer', accountId: 'a_wallet', toAccountId: 'a_savings', amount: 70_000, toAmount: usd(70_000), base: usd(70_000), payee: 'Move to savings' });
  const course = addDays(start, 40);
  add({ date: course, kind: 'expense', accountId: 'a_current', amount: usd(1299), categoryId: 'education', payee: 'Udemy', original: { amount: 1299, currency: 'USD' } });

  // A few recent ones still waiting for a category.
  for (const [ago, payee, amount] of [
    [1, 'Kiosk 24', 750],
    [3, 'Bookshop', 4_250],
    [5, 'Kiosk 24', 1_000],
  ] as const) {
    const date = addDays(today, -ago);
    if (date >= start) add({ date, kind: 'expense', accountId: 'a_current', amount, payee });
  }

  d.txns = txns.filter((t) => t.date <= today);
  d.budgets = [
    ['groceries', 55_000],
    ['eating-out', 25_000],
    ['delivery', 25_000],
    ['coffee', 20_000],
    ['fuel', 25_000],
    ['shopping', 25_000],
    ['fun', 10_000],
  ].map(([categoryId, amount]) => ({ categoryId: categoryId as string, amount: amount as number, rollover: false, since: start }));
  d.target = { date: addMonths(current.start, 20), floor: 500_000, label: 'Until graduation' };
  d.rules = [{ id: 'rule_demo', match: 'TALABAT', categoryId: 'delivery', payee: 'Talabat', createdAt: 0 }];
  return d;
}
