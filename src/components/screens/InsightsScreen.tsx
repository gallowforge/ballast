import { useMemo, useState } from 'preact/hooks';
import { cycleAt, formatMonth, formatShort, formatWeekday, addDays, type Cycle } from '@/lib/dates';
import { formatMinor, formatMoney } from '@/lib/money/money';
import { currency } from '@/lib/money/currency';
import { insights } from '@/lib/calc/insights';
import {
  byCategory,
  byDay,
  byWeekday,
  cashflow,
  income,
  spending,
  topPayees,
} from '@/lib/calc/stats';
import { categoryMap } from '@/lib/ledger';
import { Cashflow } from '../charts/Cashflow';
import { Heatmap } from '../charts/Heatmap';
import { InsightCard, SectionTitle, Swatch, catColor } from '../parts/parts';
import { Empty, Segmented, Skeleton } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { useLedger, useToday } from '../ui/hooks';

type Range = '0' | '-1' | '3' | '6' | '12';

export default function InsightsScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const [range, setRange] = useState<Range>('0');
  const base = data.settings.base;
  const day = data.settings.cycleDay;

  const view = useMemo(() => {
    if (!ready) return null;
    const cur = cycleAt(today, day, 0);
    let period: { start: string; end: string; label: string; months: number };
    let prev: { start: string; end: string };
    if (range === '0') {
      period = { start: cur.start, end: today, label: 'this month so far', months: 1 };
      const p = cycleAt(today, day, -1);
      prev = {
        start: p.start,
        end: addDays(
          p.start,
          Math.min(p.days - 1, Math.round((Date.parse(today) - Date.parse(cur.start)) / 864e5)),
        ),
      };
    } else if (range === '-1') {
      const p = cycleAt(today, day, -1);
      period = { start: p.start, end: p.end, label: formatMonth(p.start), months: 1 };
      const pp = cycleAt(today, day, -2);
      prev = { start: pp.start, end: pp.end };
    } else {
      const n = Number(range);
      const first = cycleAt(today, day, -n);
      const last = cycleAt(today, day, -1);
      period = { start: first.start, end: last.end, label: `the last ${n} months`, months: n };
      const pf = cycleAt(today, day, -2 * n);
      prev = { start: pf.start, end: addDays(first.start, -1) };
    }
    const cats = byCategory(data, period.start, period.end);
    const prevCats = new Map(
      byCategory(data, prev.start, prev.end).map((c) => [c.categoryId, c.total]),
    );
    const out = spending(data, period.start, period.end);
    const inc = income(data, period.start, period.end);
    const cycles: Cycle[] = Array.from({ length: 12 }, (_, i) => cycleAt(today, day, i - 11));
    const firstTxn = data.txns.reduce<string | null>(
      (m, t) => (!m || t.date < m ? t.date : m),
      null,
    );
    const flow = cashflow(
      data,
      cycles.filter((c) => firstTxn && c.end >= firstTxn),
    );
    const heatCycle = range === '-1' ? cycleAt(today, day, -1) : cur;
    return {
      period,
      cats,
      prevCats,
      out,
      inc,
      prevOut: spending(data, prev.start, prev.end),
      flow,
      heat: byDay(data, heatCycle.start, heatCycle.end),
      heatLabel: formatMonth(heatCycle.start),
      payees: topPayees(data, period.start, period.end, 6),
      weekdays: byWeekday(data, period.start, period.end),
      tips: insights(data, today),
      catMap: categoryMap(data),
    };
  }, [data, today, ready, range]);

  if (!ready || !view) return <Skeleton class="h-[34rem]" />;
  if (!data.txns.length)
    return (
      <Empty
        level={2}
        title="Nothing to chart yet."
        body="Add a few transactions or bring in a statement. The pictures fill in as soon as there is something to show."
      />
    );

  const { cats, catMap, prevCats } = view;
  const exp = currency(base).exp;
  const change = view.prevOut ? Math.round(((view.out - view.prevOut) / view.prevOut) * 100) : null;
  const wdMax = Math.max(1, ...view.weekdays);
  const strip = cats.slice(0, 8);
  const rest = cats.slice(8).reduce((s, c) => s + c.total, 0);

  return (
    <div class="grid grid-cols-1 gap-14">
      <div class="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <Segmented
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: '0', label: 'This month' },
            { value: '-1', label: 'Last month' },
            { value: '3', label: '3 months' },
            { value: '6', label: '6 months' },
            { value: '12', label: '12 months' },
          ]}
        />
        <button type="button" class="link no-print text-sm" onClick={() => window.print()}>
          Print, or save as PDF
        </button>
      </div>

      <section aria-labelledby="where-title" class="animate-rise">
        <p class="caps">Spent, {view.period.label}</p>
        <div class="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
          <h2 id="where-title" class="figure text-[4.2rem] sm:text-[5.5rem]">
            <Money value={view.out} code={base} count />
          </h2>
          <p class="serif pb-3 text-[1.2rem] text-muted italic">
            {change === null
              ? 'Nothing earlier to compare with yet.'
              : change === 0
                ? 'Exactly what you spent before.'
                : `${Math.abs(change)}% ${change < 0 ? 'less' : 'more'} than the period before.`}
            {view.inc ? (
              <>
                {' '}
                <Money value={view.inc} code={base} class="not-italic text-good" /> came in.
              </>
            ) : null}
          </p>
        </div>
        <div
          class="mt-8 flex h-14 w-full overflow-hidden rounded-[3px]"
          role="img"
          aria-label={`Where it went: ${strip.map((c) => `${catMap.get(c.categoryId)?.name ?? 'Uncategorised'} ${formatMoney(c.total, base)}`).join(', ')}`}
        >
          {strip.map((c, i) => (
            <span
              key={c.categoryId}
              class="h-full border-r-2 border-bg"
              style={{ width: `${(c.total / Math.max(1, view.out)) * 100}%`, background: catColor(catMap.get(c.categoryId)), animation: `grow .9s var(--ease-out-quint) ${i * 50}ms backwards`, transformOrigin: 'left' }}
            />
          ))}
          {rest > 0 && <span class="h-full bg-line-strong" style={{ width: `${(rest / Math.max(1, view.out)) * 100}%` }} />}
        </div>
        <dl class="mt-6 grid gap-x-12 sm:grid-cols-2">
          {cats.slice(0, 10).map((c) => {
            const before = prevCats.get(c.categoryId) ?? 0;
            const diff = c.total - before;
            return (
              <div key={c.categoryId} class="flex items-baseline gap-3 border-b border-line py-2.5">
                <Swatch category={catMap.get(c.categoryId)} />
                <dt class="min-w-0 flex-1 truncate font-bold">{catMap.get(c.categoryId)?.name ?? 'Needs a category'}</dt>
                <span class={`w-16 text-right text-[0.78rem] ${diff > 0 ? 'text-warn' : 'text-subtle'}`}>
                  {!before ? 'new' : diff === 0 ? 'same' : formatMinor(diff, exp, { sign: 'always' })}
                </span>
                <dd class="w-24 text-right">
                  <Money value={c.total} code={base} unit={false} class="text-[1.1rem]" />
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {view.flow.length > 1 && (
        <section aria-labelledby="flow-title" class="animate-rise" style={{ animationDelay: '60ms' }}>
          <SectionTitle id="flow-title" title="In and out, month by month">
            <span class="ml-auto flex gap-4 text-xs font-bold text-subtle">
              <span class="inline-flex items-center gap-1.5">
                <i class="size-2.5 bg-good" /> In
              </span>
              <span class="inline-flex items-center gap-1.5">
                <i class="size-2.5 bg-fg" /> Out
              </span>
            </span>
          </SectionTitle>
          <p class="mt-2 mb-4 text-sm text-subtle">Moving money between your own accounts is left out.</p>
          <Cashflow rows={view.flow} code={base} />
        </section>
      )}

      <div class="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-12">
        <section aria-labelledby="cal-title" class="animate-rise" style={{ animationDelay: '100ms' }}>
          <SectionTitle id="cal-title" title={`Day by day, ${view.heatLabel}`} />
          <div class="mt-4">
            <Heatmap days={view.heat} code={base} today={today} />
          </div>
        </section>
        <section aria-labelledby="payee-title" class="animate-rise" style={{ animationDelay: '140ms' }}>
          <SectionTitle id="payee-title" title="Where you spend most" />
          <ol>
            {view.payees.map((p, i) => (
              <li key={p.payee} class="flex items-baseline gap-3 border-b border-line py-2.5">
                <span class="figure w-6 text-[1.2rem] text-gold-ink">{i + 1}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold">{p.payee}</span>
                  <span class="flex items-center gap-1.5 text-xs text-subtle">
                    <Swatch category={p.categoryId ? catMap.get(p.categoryId) : null} />
                    {p.count === 1 ? 'once' : `${p.count} times`}
                  </span>
                </span>
                <Money value={p.total} code={base} class="text-[1.08rem]" />
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="wd-title" class="animate-rise" style={{ animationDelay: '180ms' }}>
          <SectionTitle id="wd-title" title="By day of the week" />
          <div class="mt-5 flex h-40 items-end gap-2" role="list" aria-label="Average spending by day of the week">
            {view.weekdays.map((v, i) => {
              const d = addDays('2026-01-04', i); // any Sunday: only the weekday name is used
              return (
                <div key={i} role="listitem" class="flex h-full flex-1 flex-col items-center justify-end gap-1.5" aria-label={`${formatWeekday(d)}: ${formatMoney(v, base)} on average`}>
                  <div
                    class={`w-full ${v === wdMax ? 'bg-gold' : 'bg-fg/25'}`}
                    style={{ height: `${Math.max(3, (v / wdMax) * 100)}%`, animation: `rise .6s var(--ease-out-quint) ${i * 40}ms backwards` }}
                  />
                  <span class="text-xs font-bold text-subtle">{formatWeekday(d, true).slice(0, 2)}</span>
                </div>
              );
            })}
          </div>
          <p class="mt-3 text-xs text-subtle">Average a day, {view.period.label}, from {formatShort(view.period.start)}.</p>
        </section>
      </div>

      {view.tips.length > 0 && (
        <section aria-labelledby="tips-title" class="animate-rise" style={{ animationDelay: '220ms' }}>
          <SectionTitle id="tips-title" title="In the margin" />
          <div class="mt-5 grid gap-8 md:grid-cols-2">
            {view.tips.map((i) => (
              <InsightCard key={i.id} i={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
