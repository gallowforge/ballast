/**
 * A believable, entirely made-up money life for trying Ballast: "Alex", taking time out between
 * jobs to build something of their own, living on a monthly salary paid from savings, with some
 * freelance work paid in euros. Everything is relative to today and generated from a fixed seed,
 * so it is the same on every device and never stale.
 */
import { addDays, addMonths, cycleOf, dayInMonth, parts, type ISODate } from './dates';
import { emptyData } from './defaults';
import { seeded } from './ids';
import { convert } from './money/fx';
import type { LedgerData, Recurring, Txn } from './model';
import { occurrences } from './calc/recurring';
import { paydays } from './calc/cycle';

/** US dollars for one euro, as Alex's bank charged it. */
const EUR_RATE = '1.1612';
const SALARY = 3_100_00;

export function buildDemo(today: ISODate): LedgerData {
  const rnd = seeded(7311);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  /** A random price between lo and hi (dollars), rounded to `step` cents. */
  const price = (lo: number, hi: number, step = 1) =>
    Math.round(((lo + rnd() * (hi - lo)) * 100) / step) * step;

  const d = emptyData('USD');
  const current = cycleOf(today, 1);
  const start = addMonths(current.start, -5);
  d.settings = { base: 'USD', cycleDay: 1, name: 'Alex', onboarded: true, demo: true };
  d.rates = { EUR: { rate: EUR_RATE, on: today } };
  d.accounts = [
    {
      id: 'a_savings',
      name: 'Savings',
      role: 'savings',
      currency: 'USD',
      opening: 75_600_00,
      openedOn: start,
    },
    {
      id: 'a_current',
      name: 'Current account',
      role: 'spending',
      currency: 'USD',
      opening: 1_148_20,
      openedOn: start,
    },
    {
      id: 'a_wallet',
      name: 'Euro wallet',
      role: 'other',
      currency: 'EUR',
      opening: 0,
      openedOn: start,
    },
  ];

  const txns: Txn[] = [];
  let n = 0;
  const add = (
    t: Omit<Txn, 'id' | 'createdAt' | 'base' | 'source'> & {
      base?: number;
      source?: Txn['source'];
    },
  ) => {
    const base = t.base ?? t.amount;
    txns.push({ source: 'demo', ...t, base, id: `demo_${++n}`, createdAt: n });
  };

  // Pay yourself: a salary from savings on the 1st of every month.
  d.salary = {
    active: true,
    amount: SALARY,
    fromAccountId: 'a_savings',
    toAccountId: 'a_current',
    autoPost: true,
    startedOn: start,
  };
  const days = paydays(d.salary, 1, start, today);
  for (const date of days)
    add({
      date,
      kind: 'transfer',
      accountId: 'a_savings',
      toAccountId: 'a_current',
      amount: SALARY,
      toAmount: SALARY,
      payee: 'Salary',
      note: 'Paid to yourself from savings',
      source: 'salary',
    });
  d.salary.lastPostedOn = days[days.length - 1];

  const { y, m } = parts(start);
  const on = (day: number) => dayInMonth(y, m, day);
  const monthly = (
    id: string,
    name: string,
    amount: number,
    categoryId: string,
    day: number,
  ): Recurring => ({
    id,
    name,
    kind: 'expense',
    amount,
    accountId: 'a_current',
    categoryId,
    every: 1,
    unit: 'month',
    startOn: on(day),
    autoPost: true,
  });
  const recurring: Recurring[] = [
    monthly('r_rent', 'Rent', 1_350_00, 'home', 1),
    monthly('r_gym', 'Gym membership', 45_00, 'health', 3),
    monthly('r_phone', 'Phone plan', 30_00, 'bills', 6),
    monthly('r_internet', 'Home internet', 55_00, 'bills', 8),
    monthly('r_spotify', 'Spotify', 11_99, 'subscriptions', 9),
    // A careful reader's reward: Alex keeps one houseplant alive, on a budget.
    monthly('r_fern', "Fern's plant food", 6_50, 'other', 12),
    monthly('r_netflix', 'Netflix', 15_49, 'subscriptions', 15),
    monthly('r_power', 'Electricity', 64_00, 'home', 18),
    monthly('r_cloud', 'Cloud storage', 2_99, 'subscriptions', 21),
    {
      id: 'r_insurance',
      name: 'Car insurance',
      kind: 'expense',
      amount: 960_00,
      accountId: 'a_savings',
      categoryId: 'travel',
      every: 1,
      unit: 'year',
      startOn: addMonths(current.start, 3),
      autoPost: true,
    },
    {
      id: 'r_contract',
      name: 'Contract work',
      kind: 'income',
      amount: 1_400_00,
      accountId: 'a_savings',
      categoryId: 'freelance',
      every: 1,
      unit: 'month',
      startOn: addDays(addMonths(current.start, 10), 24),
      autoPost: true,
    },
  ];
  for (const r of recurring) {
    const past = occurrences(r, r.startOn, today);
    for (const date of past)
      add({
        date,
        kind: r.kind,
        accountId: r.accountId,
        amount: r.amount,
        categoryId: r.categoryId,
        payee: r.name,
        recurringId: r.id,
        source: 'recurring',
      });
    if (past.length) r.lastPostedOn = past[past.length - 1];
  }
  d.recurring = recurring;

  // Everyday spending from the current account.
  const eur = (cents: number) => convert(cents, 'EUR', 'USD', EUR_RATE)!;
  let lastFuel = start;
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const spend = (payee: string, categoryId: string | undefined, amount: number) =>
      add({ date, kind: 'expense', accountId: 'a_current', amount, categoryId, payee });
    if (rnd() < 0.4)
      spend(
        pick(['Starbucks', 'Pret A Manger', 'Blue Bottle Coffee', 'Starbucks']),
        'coffee',
        price(3.75, 6.5, 5),
      );
    if (rnd() < 0.15) spend('Uber Eats', 'delivery', price(16, 34));
    if (wd === 5 && rnd() < 0.9)
      spend(pick(['Aldi', 'Whole Foods Market', 'Lidl']), 'groceries', price(62, 122));
    else if (rnd() < 0.1) spend('Corner shop', 'groceries', price(6, 22));
    if (addDays(lastFuel, 6 + Math.floor(rnd() * 3)) <= date) {
      spend(pick(['Shell', 'BP', 'Shell']), 'fuel', price(38, 58));
      lastFuel = date;
    }
    if (rnd() < 0.08)
      spend(
        pick(['Shake Shack', 'Five Guys', 'Nando’s', 'Wagamama', 'Chipotle']),
        'eating-out',
        price(18, 52),
      );
    if (rnd() < 0.07) spend('Uber', 'transport', price(9, 26));
    if (rnd() < 0.04) spend('Amazon', 'shopping', price(18, 72));
    if (rnd() < 0.015) spend(pick(['IKEA', 'Uniqlo', 'Zara']), 'shopping', price(25, 120));
    if (rnd() < 0.04) spend(pick(['Cinema', 'Cinema', 'Bowling']), 'fun', price(12, 26, 50));
    if (rnd() < 0.015) spend('Pharmacy', 'health', price(8, 24));
    if (rnd() < 0.015) spend(pick(['Flower shop', 'Gift for Sam']), 'gifts', price(20, 55));
  }

  // An audiobook plan Alex never set up as recurring, which Insights notices (and its price rise).
  const audible: ISODate[] = [];
  for (let i = 0; i <= 6; i++) {
    const { y: ay, m: am } = parts(addMonths(start, i));
    const date = dayInMonth(ay, am, 19);
    if (date <= today) audible.push(date);
  }
  audible.forEach((date, i) =>
    add({
      date,
      kind: 'expense',
      accountId: 'a_current',
      amount: i === audible.length - 1 ? 15_95 : 14_95,
      categoryId: 'subscriptions',
      payee: 'Audible',
    }),
  );

  // A long weekend in Lisbon, paid by card in euros.
  for (const [offset, payee, categoryId, cents] of [
    [52, 'Booking.com', 'travel', 312_00],
    [53, 'Time Out Market', 'eating-out', 41_80],
    [54, 'Pastéis de Belém', 'coffee', 9_60],
  ] as const)
    add({
      date: addDays(start, offset),
      kind: 'expense',
      accountId: 'a_current',
      amount: eur(cents),
      categoryId,
      payee,
      original: { amount: cents, currency: 'EUR' },
    });

  // Freelance design work, paid in euros into a euro wallet, partly moved to savings.
  const gigs = [
    [24, 1_200_00],
    [71, 1_850_00],
    [118, 950_00],
  ] as const;
  for (const [offset, cents] of gigs) {
    const date = addDays(start, offset);
    if (date > today) continue;
    add({
      date,
      kind: 'income',
      accountId: 'a_wallet',
      amount: cents,
      base: eur(cents),
      categoryId: 'freelance',
      payee: 'Kestrel Studio',
    });
  }
  const move = addDays(start, 75);
  if (move <= today)
    add({
      date: move,
      kind: 'transfer',
      accountId: 'a_wallet',
      toAccountId: 'a_savings',
      amount: 2_000_00,
      toAmount: eur(2_000_00),
      base: eur(2_000_00),
      payee: 'Move to savings',
    });
  add({
    date: addDays(start, 40),
    kind: 'expense',
    accountId: 'a_current',
    amount: 14_99,
    categoryId: 'education',
    payee: 'Udemy',
  });

  // A few recent ones still waiting for a category.
  for (const [ago, payee, amount] of [
    [1, 'Corner kiosk', 3_50],
    [3, 'Bookshop', 18_40],
    [5, 'Corner kiosk', 4_25],
  ] as const) {
    const date = addDays(today, -ago);
    if (date >= start) add({ date, kind: 'expense', accountId: 'a_current', amount, payee });
  }

  d.txns = txns.filter((t) => t.date <= today);
  d.budgets = [
    ['groceries', 420_00],
    ['eating-out', 160_00],
    ['delivery', 160_00],
    ['coffee', 120_00],
    ['fuel', 190_00],
    ['shopping', 150_00],
    ['fun', 60_00],
  ].map(([categoryId, amount]) => ({
    categoryId: categoryId as string,
    amount: amount as number,
    rollover: false,
    since: start,
  }));
  d.target = { date: addMonths(current.start, 20), floor: 5_000_00, label: 'Back to work' };
  d.rules = [
    {
      id: 'rule_demo',
      match: 'UBER EATS',
      categoryId: 'delivery',
      payee: 'Uber Eats',
      createdAt: 0,
    },
  ];
  return d;
}
