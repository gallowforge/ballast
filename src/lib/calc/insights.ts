import { addDays, cycleAt, cycleOf, diffDays, formatWeekday, ordinal, plural, type ISODate } from '../dates';
import { formatMoney, type Minor } from '../money/money';
import type { LedgerData, Recurring, Txn, Unit } from '../model';
import { categoryMap } from '../ledger';
import { budgetStates } from './budgets';
import { monthlyEquivalent, yearlyEquivalent } from './recurring';
import { byCategory, byWeekday, income, median, spending } from './stats';

export type Tone = 'good' | 'neutral' | 'warn';

export interface Insight {
  id: string;
  tone: Tone;
  icon: string;
  title: string;
  body: string;
  action?:
    | { kind: 'link'; label: string; href: string }
    | { kind: 'track'; label: string; suggestion: RecurringSuggestion };
}

export interface RecurringSuggestion {
  key: string;
  payee: string;
  amount: Minor;
  every: number;
  unit: Unit;
  categoryId?: string;
  accountId: string;
  last: ISODate;
  count: number;
  /** The previous amount, when the latest charge changed. */
  previous?: Minor;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when a recurring item already covers this payee and amount. */
function tracked(recurring: Recurring[], payee: string, amount: Minor): boolean {
  const key = norm(payee);
  return recurring.some((r) => {
    const name = norm(r.name);
    const nameMatch = !!name && !!key && (name.includes(key) || key.includes(name));
    const close = Math.abs(r.amount - amount) <= amount * 0.1;
    return nameMatch && close;
  });
}

/**
 * Finds payments that repeat: the same payee at a steady amount (within 10%) and a steady interval
 * (weekly, monthly or yearly), still active, and not yet tracked as a recurring cost.
 */
export function detectRecurring(data: LedgerData, today: ISODate): RecurringSuggestion[] {
  const groups = new Map<string, Txn[]>();
  for (const t of data.txns) {
    if (t.kind !== 'expense' || t.source === 'recurring') continue;
    const key = norm(t.payee);
    if (key.length < 2) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps = list.slice(1).map((t, i) => diffDays(list[i]!.date, t.date));
    const gap = median(gaps);
    let unit: Unit | null = null;
    if (gap >= 26 && gap <= 35) unit = 'month';
    else if (gap >= 6 && gap <= 8) unit = 'week';
    else if (gap >= 350 && gap <= 380) unit = 'year';
    if (!unit) continue;
    // Every gap must be near the median, so a payee you visit often is not mistaken for a bill.
    if (gaps.some((g) => Math.abs(g - gap) > Math.max(4, gap * 0.15))) continue;
    const amounts = list.map((t) => t.amount);
    const mid = median(amounts.slice(-4));
    const recent = list.slice(-3);
    if (recent.some((t) => Math.abs(t.amount - mid) > mid * 0.1 && t !== list[list.length - 1])) continue;
    const last = list[list.length - 1]!;
    if (diffDays(last.date, today) > gap * 1.6) continue;
    if (tracked(data.recurring, last.payee, last.amount)) continue;
    const prev = list[list.length - 2]!;
    out.push({
      key,
      payee: last.payee,
      amount: last.amount,
      every: 1,
      unit,
      categoryId: last.categoryId,
      accountId: last.accountId,
      last: last.date,
      count: list.length,
      previous: prev.amount !== last.amount ? prev.amount : undefined,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** Plain-language observations, most useful first. Each one needs enough data to be fair. */
export function insights(data: LedgerData, today: ISODate): Insight[] {
  const base = data.settings.base;
  const money = (m: Minor) => formatMoney(m, base);
  const cats = categoryMap(data);
  const catName = (id?: string) => (id ? (cats.get(id)?.name ?? 'Other') : 'Uncategorised');
  const day = data.settings.cycleDay;
  const cur = cycleOf(today, day);
  const prev = cycleAt(today, day, -1);
  const gone = diffDays(cur.start, today);
  const prevSameDay = addDays(prev.start, Math.min(gone, prev.days - 1));
  const hasPrev = data.txns.some((t) => t.date >= prev.start && t.date <= prev.end);
  const out: Insight[] = [];

  // Budgets that are already over.
  for (const b of budgetStates(data, today)) {
    if (b.status !== 'over') continue;
    out.push({
      id: `over:${b.budget.categoryId}:${cur.start}`,
      tone: 'warn',
      icon: 'alert',
      title: `${catName(b.budget.categoryId)} is over budget by ${money(b.spent - b.available)}`,
      body: `${money(b.spent)} spent of ${money(b.available)} this month.`,
      action: { kind: 'link', label: 'See budgets', href: 'plan/' },
    });
  }

  // Pace against the same point last month.
  if (hasPrev && gone >= 3) {
    const now = spending(data, cur.start, today);
    const then = spending(data, prev.start, prevSameDay);
    if (then > 0 && now > 0) {
      const change = Math.round(((now - then) / then) * 100);
      if (Math.abs(change) >= 10) {
        out.push({
          id: `pace:${cur.start}:${today}`,
          tone: change < 0 ? 'good' : 'warn',
          icon: change < 0 ? 'trending-down' : 'trending-up',
          title: `Spending is ${Math.abs(change)}% ${change < 0 ? 'lower' : 'higher'} than this point last month`,
          body: `${money(now)} so far, against ${money(then)} by day ${gone + 1} last month.`,
        });
      }
      // The category that moved most.
      const nowCats = byCategory(data, cur.start, today);
      const thenCats = new Map(byCategory(data, prev.start, prevSameDay).map((c) => [c.categoryId, c.total]));
      let best: { id: string; diff: Minor; now: Minor; then: Minor } | null = null;
      for (const c of nowCats) {
        const diff = c.total - (thenCats.get(c.categoryId) ?? 0);
        if (!best || diff > best.diff) best = { id: c.categoryId, diff, now: c.total, then: thenCats.get(c.categoryId) ?? 0 };
      }
      if (best && best.diff > 0 && best.diff >= now * 0.08) {
        out.push({
          id: `riser:${best.id}:${cur.start}`,
          tone: 'neutral',
          icon: 'insights',
          title: `${catName(best.id)} is up ${money(best.diff)} on last month`,
          body: best.then
            ? `${money(best.now)} so far this month, ${money(best.then)} by this point last month.`
            : `${money(best.now)} so far this month, and nothing by this point last month.`,
          action: { kind: 'link', label: 'See the breakdown', href: 'insights/' },
        });
      }
    }
  }

  // Repeating payments that are not tracked yet.
  for (const s of detectRecurring(data, today).slice(0, 3)) {
    const every = s.unit === 'month' ? 'month' : s.unit === 'week' ? 'week' : 'year';
    out.push({
      id: `sub:${s.key}`,
      tone: 'neutral',
      icon: 'repeat',
      title: `Looks like a ${every}ly payment: ${s.payee}, ${money(s.amount)}`,
      body:
        `Charged ${plural(s.count, 'time')}, about once a ${every}.` +
        (s.previous ? ` The last charge changed from ${money(s.previous)}.` : '') +
        ' Track it to see it coming and keep it out of your safe-to-spend.',
      action: { kind: 'track', label: 'Track it', suggestion: s },
    });
  }

  // A purchase much bigger than usual for its category, in the last week.
  const recent = data.txns.filter((t) => t.kind === 'expense' && diffDays(t.date, today) <= 7 && t.date <= today);
  for (const t of recent.sort((a, b) => b.base - a.base).slice(0, 1)) {
    const peers = data.txns
      .filter((x) => x.kind === 'expense' && x.categoryId === t.categoryId && x.id !== t.id)
      .map((x) => x.base);
    const usual = median(peers);
    if (peers.length >= 4 && usual > 0 && t.base >= usual * 3) {
      out.push({
        id: `big:${t.id}`,
        tone: 'neutral',
        icon: 'sparkle',
        title: `Bigger than usual: ${money(t.base)} at ${t.payee}`,
        body: `A typical ${catName(t.categoryId).toLowerCase()} spend is ${money(usual)}.`,
      });
    }
  }

  // Recurring costs, as a year.
  const costs = data.recurring.filter((r) => r.kind === 'expense' && (!r.endOn || r.endOn >= today));
  if (costs.length >= 2) {
    const year = costs.reduce((s, r) => s + yearlyEquivalent(r), 0);
    const month = costs.reduce((s, r) => s + monthlyEquivalent(r), 0);
    const salary = data.salary?.active ? data.salary.amount : 0;
    out.push({
      id: `fixed:${year}`,
      tone: 'neutral',
      icon: 'calendar',
      title: `Your ${costs.length} recurring costs add up to ${money(year)} a year`,
      body:
        `That is ${money(month)} a month` +
        (salary ? `, ${Math.round((month / salary) * 100)}% of your salary.` : '.'),
      action: { kind: 'link', label: 'Review them', href: 'plan/#recurring' },
    });
  }

  // How much of last month's income was kept.
  if (hasPrev) {
    const inc = income(data, prev.start, prev.end);
    const out_ = spending(data, prev.start, prev.end);
    if (inc > 0) {
      const kept = Math.round(((inc - out_) / inc) * 100);
      out.push({
        id: `kept:${prev.start}`,
        tone: kept >= 0 ? 'good' : 'neutral',
        icon: 'piggy',
        title: kept >= 0 ? `You kept ${kept}% of what came in last month` : `Last month cost ${money(out_ - inc)} more than came in`,
        body: `${money(inc)} in, ${money(out_)} out.`,
      });
    }
  }

  // The most expensive day of the week, over the last eight weeks.
  const start8 = addDays(today, -56);
  if (data.txns.some((t) => t.date <= start8)) {
    const avg = byWeekday(data, start8, addDays(today, -1));
    const top = avg.indexOf(Math.max(...avg));
    const mean = avg.reduce((s, v) => s + v, 0) / 7;
    if (avg[top]! > mean * 1.4) {
      const name = formatWeekday(nextWeekday(today, top));
      out.push({
        id: `weekday:${top}`,
        tone: 'neutral',
        icon: 'calendar',
        title: `${name}s cost the most: ${money(avg[top]!)} on average`,
        body: `Against ${money(Math.round(mean))} on an average day over the last eight weeks.`,
      });
    }
  }

  // Things waiting for a category.
  const loose = data.txns.filter((t) => t.kind !== 'transfer' && !t.categoryId).length;
  if (loose >= 3) {
    out.push({
      id: `loose:${loose}`,
      tone: 'neutral',
      icon: 'tag',
      title: `${plural(loose, 'transaction')} need a category`,
      body: 'Categories make your budgets and charts honest. One tap each; Ledger learns as you go.',
      action: { kind: 'link', label: 'Sort them', href: 'activity/?filter=uncategorised' },
    });
  }

  const dismissed = new Set(data.dismissed);
  return out.filter((i) => !dismissed.has(i.id));
}

function nextWeekday(from: ISODate, w: number): ISODate {
  let d = from;
  for (let i = 0; i < 7; i++, d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() === w) return d;
  return from;
}

/** "Your money month starts on the 25th." */
export function describeCycleDay(day: number): string {
  return day === 1 ? 'on the 1st of each month' : `on the ${ordinal(day)} of each month`;
}
