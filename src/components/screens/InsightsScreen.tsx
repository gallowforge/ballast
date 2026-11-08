import { useMemo, useState } from 'preact/hooks';
import { cycleAt, formatMonth, formatShort, formatWeekday, addDays, type Cycle } from '@/lib/dates';
import { formatMinor, formatMoney } from '@/lib/money/money';
import { currency } from '@/lib/money/currency';
import { insights } from '@/lib/calc/insights';
import { byCategory, byDay, byWeekday, cashflow, income, spending, topPayees } from '@/lib/calc/stats';
import { categoryMap } from '@/lib/ledger';
import { Cashflow } from '../charts/Cashflow';
import { Donut } from '../charts/Donut';
import { Heatmap } from '../charts/Heatmap';
import { InsightCard, SectionTitle } from '../parts/parts';
import { CategoryTile, Empty, Segmented, Skeleton } from '../ui/Controls';
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
      prev = { start: p.start, end: addDays(p.start, Math.min(p.days - 1, Math.round((Date.parse(today) - Date.parse(cur.start)) / 864e5))) };
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
    const prevCats = new Map(byCategory(data, prev.start, prev.end).map((c) => [c.categoryId, c.total]));
    const out = spending(data, period.start, period.end);
    const inc = income(data, period.start, period.end);
    const cycles: Cycle[] = Array.from({ length: 12 }, (_, i) => cycleAt(today, day, i - 11));
    const firstTxn = data.txns.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);
    const flow = cashflow(data, cycles.filter((c) => firstTxn && c.end >= firstTxn));
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

  if (!ready || !view) return <Skeleton class="h-[34rem] rounded-3xl" />;
  if (!data.txns.length)
    return (
      <div class="card">
        <Empty icon="insights" title="Charts need some history" body="Add transactions or import a statement. Charts fill in as soon as there is something to show." />
      </div>
    );

  const { cats, catMap, prevCats } = view;
  const colour = (id: string) => (id ? `oklch(70% 0.13 ${catMap.get(id)?.hue ?? 80})` : 'var(--subtle)');
  const slices = cats.slice(0, 7).map((c) => ({ id: c.categoryId, label: catMap.get(c.categoryId)?.name ?? 'Uncategorised', value: c.total, color: colour(c.categoryId) }));
  const rest = cats.slice(7).reduce((s, c) => s + c.total, 0);
  if (rest) slices.push({ id: 'rest', label: 'Everything else', value: rest, color: 'var(--line-strong)' });
  const change = view.prevOut ? Math.round(((view.out - view.prevOut) / view.prevOut) * 100) : null;
  const wdMax = Math.max(1, ...view.weekdays);

  return (
    <div class="grid gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3 animate-rise">
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
          class="scroll-x max-w-full"
        />
        <button type="button" class="btn btn-soft btn-sm no-print" onClick={() => window.print()}>
          <Icon name="printer" size={16} /> Print or save as PDF
        </button>
      </div>

      <section class="card card-pad animate-rise" aria-labelledby="where-title">
        <div class="grid items-center gap-8 lg:grid-cols-[auto_1fr]">
          <div class="justify-self-center">
            <Donut slices={slices} size={230} thickness={24} label={`Spending by category for ${view.period.label}: ${slices.map((s) => `${s.label} ${formatMoney(s.value, base)}`).join(', ')}`}>
              <div>
                <div class="text-xs font-semibold text-subtle">Spent</div>
                <div class="display text-[1.75rem]">
                  <Money value={view.out} code={base} count />
                </div>
                {change !== null && (
                  <div class={`mt-1 text-xs font-bold ${change <= 0 ? 'text-good' : 'text-warn'}`}>
                    {change <= 0 ? '↓' : '↑'} {Math.abs(change)}% vs before
                  </div>
                )}
              </div>
            </Donut>
          </div>
          <div>
            <h2 id="where-title" class="text-lg font-bold">
              Where it went
            </h2>
            <p class="mb-4 text-sm text-muted">
              Spending for {view.period.label}
              {view.inc ? (
                <>
                  , against <Money value={view.inc} code={base} class="font-semibold text-good" /> coming in
                </>
              ) : null}
              .
            </p>
            <div class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {cats.slice(0, 10).map((c) => {
                const before = prevCats.get(c.categoryId) ?? 0;
                const diff = c.total - before;
                return (
                  <div key={c.categoryId} class="flex items-center gap-3">
                    <CategoryTile category={catMap.get(c.categoryId)} size="sm" />
                    <div class="min-w-0 flex-1">
                      <div class="flex justify-between gap-2">
                        <span class="truncate font-semibold">{catMap.get(c.categoryId)?.name ?? 'Uncategorised'}</span>
                        <Money value={c.total} code={base} class="font-bold" />
                      </div>
                      <div class="mt-1 flex items-center gap-2">
                        <div class="bar h-1.5 flex-1">
                          <span style={{ width: `${(c.total / Math.max(1, cats[0]!.total)) * 100}%`, background: colour(c.categoryId) }} />
                        </div>
                        <span class={`w-20 text-right text-xs font-semibold ${diff > 0 ? 'text-warn' : 'text-subtle'}`}>{!before ? 'new' : diff === 0 ? 'same' : formatMinor(diff, currency(base).exp, { sign: 'always' })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {view.flow.length > 1 && (
        <section class="card card-pad animate-rise" aria-labelledby="flow-title" style={{ animationDelay: '60ms' }}>
          <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="flow-title" class="text-lg font-bold">
                Money in and out
              </h2>
              <p class="text-sm text-muted">Month by month. Transfers between your own accounts are left out.</p>
            </div>
            <div class="flex gap-4 text-xs font-semibold text-subtle">
              <span class="inline-flex items-center gap-1.5">
                <i class="size-2.5 rounded-full bg-good" /> In
              </span>
              <span class="inline-flex items-center gap-1.5">
                <i class="size-2.5 rounded-full bg-gold" /> Out
              </span>
            </div>
          </div>
          <Cashflow rows={view.flow} code={base} />
        </section>
      )}

      <div class="grid gap-6 lg:grid-cols-3">
        <section class="card card-pad animate-rise" aria-labelledby="cal-title" style={{ animationDelay: '100ms' }}>
          <SectionTitle id="cal-title" title={`Day by day · ${view.heatLabel}`} />
          <Heatmap days={view.heat} code={base} today={today} />
        </section>
        <section class="card card-pad animate-rise" aria-labelledby="payee-title" style={{ animationDelay: '140ms' }}>
          <SectionTitle id="payee-title" title="Where you spend most" />
          <ol class="grid gap-3">
            {view.payees.map((p, i) => (
              <li key={p.payee} class="flex items-center gap-3">
                <span class="w-5 text-sm font-bold text-subtle">{i + 1}</span>
                <CategoryTile category={p.categoryId ? catMap.get(p.categoryId) : null} size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{p.payee}</span>
                  <span class="text-xs text-subtle">{p.count === 1 ? 'once' : `${p.count} times`}</span>
                </span>
                <Money value={p.total} code={base} class="font-bold" />
              </li>
            ))}
          </ol>
        </section>
        <section class="card card-pad animate-rise" aria-labelledby="wd-title" style={{ animationDelay: '180ms' }}>
          <SectionTitle id="wd-title" title="By day of the week" />
          <div class="flex h-40 items-end gap-2" role="list" aria-label="Average spending by day of the week">
            {view.weekdays.map((v, i) => {
              const d = addDays('2026-01-04', i); // any Sunday: only the weekday name is used
              return (
                <div key={i} role="listitem" class="flex h-full flex-1 flex-col items-center justify-end gap-1.5" aria-label={`${formatWeekday(d)}: ${formatMoney(v, base)} on average`}>
                  <div class="w-full rounded-lg bg-gold" style={{ height: `${Math.max(4, (v / wdMax) * 100)}%`, opacity: v === wdMax ? 1 : 0.45, animation: `rise .6s var(--ease-out-quint) ${i * 40}ms backwards` }} />
                  <span class="text-xs font-bold text-subtle">{formatWeekday(d, true).slice(0, 2)}</span>
                </div>
              );
            })}
          </div>
          <p class="mt-3 text-xs text-subtle">Average a day, {view.period.label}. From {formatShort(view.period.start)}.</p>
        </section>
      </div>

      {view.tips.length > 0 && (
        <section aria-labelledby="tips-title" class="animate-rise" style={{ animationDelay: '220ms' }}>
          <h2 id="tips-title" class="mb-3 text-lg font-bold">
            Worth knowing
          </h2>
          <div class="grid gap-4 md:grid-cols-2">
            {view.tips.map((i) => (
              <InsightCard key={i.id} i={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
