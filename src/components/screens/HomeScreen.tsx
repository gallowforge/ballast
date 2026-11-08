import { useMemo, useState } from 'preact/hooks';
import {
  addDays,
  diffDays,
  formatDayLong,
  formatMonth,
  formatShort,
  formatSpan,
  plural,
} from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import { budgetStates } from '@/lib/calc/budgets';
import { cycleSummary } from '@/lib/calc/cycle';
import { insights } from '@/lib/calc/insights';
import { upcoming } from '@/lib/calc/recurring';
import { runway } from '@/lib/calc/runway';
import { accountMap, categoryMap, savingsAccounts, sortedTxns, totalOf } from '@/lib/ledger';
import { loadDemo } from '@/lib/client';
import { openTxn } from '@/lib/bus';
import { url } from '@/lib/site';
import { BurnDown } from '../charts/BurnDown';
import { RunwayChart } from '../charts/RunwayChart';
import {
  BudgetRow,
  DemoBanner,
  InsightCard,
  SectionTitle,
  TxnRow,
  UpcomingRow,
} from '../parts/parts';
import { Empty, Skeleton } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { useLedger, useToday } from '../ui/hooks';
import { SetupSheet } from './Setup';

function greeting(name: string): string {
  const h = new Date().getHours();
  const part =
    h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

export default function HomeScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const [setup, setSetup] = useState(false);
  const base = data.settings.base;

  const view = useMemo(() => {
    if (!ready || !data.accounts.length) return null;
    const s = cycleSummary(data, today);
    const r = runway(data, today);
    const savings = totalOf(data, savingsAccounts(data)).total;
    return {
      s,
      r,
      savings,
      budgets: budgetStates(data, today)
        .sort((a, b) => b.used - a.used)
        .slice(0, 4),
      soon: upcoming(data, addDays(today, 1), addDays(today, 14)).slice(0, 5),
      tips: insights(data, today).slice(0, 2),
      recent: sortedTxns(data.txns.filter((t) => t.date <= today)).slice(0, 6),
      cats: categoryMap(data),
      accounts: accountMap(data),
    };
  }, [data, today, ready]);

  if (!ready) return <HomeSkeleton />;
  if (!view)
    return (
      <Welcome
        onSetup={() => setSetup(true)}
        today={today}
        setup={setup}
        closeSetup={() => setSetup(false)}
      />
    );

  const { s, r, budgets, soon, tips, recent, cats, accounts } = view;
  const payday = s.source === 'salary' ? addDays(s.cycle.end, 1) : null;

  return (
    <div class="grid grid-cols-1 gap-5 lg:gap-6">
      {data.settings.demo && <DemoBanner />}
      <div class="animate-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="eyebrow">{formatDayLong(today)}</p>
          <h1 class="display mt-1.5 text-[2.1rem] sm:text-[2.6rem]">
            {greeting(data.settings.name)}
          </h1>
        </div>
        {payday && (
          <span class="pill pill-gold">
            <Icon name="calendar" size={14} /> Payday{' '}
            {diffDays(today, payday) === 1 ? 'tomorrow' : `in ${diffDays(today, payday)} days`}
          </span>
        )}
      </div>

      <div class="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
        <section
          class="card card-pad card-glow animate-rise"
          aria-labelledby="safe-title"
          style={{ animationDelay: '60ms' }}
        >
          {s.source === 'none' ? (
            <div>
              <h2 id="safe-title" class="eyebrow">
                This month
              </h2>
              <p class="display mt-3 text-[2.6rem]">
                <Money value={s.spent} code={base} count />
              </p>
              <p class="text-muted mt-2">
                spent since {formatShort(s.cycle.start)}. Set a salary or budgets to see what is
                safe to spend each day.
              </p>
              <a href={url('plan/')} class="btn btn-soft btn-sm mt-4">
                Plan your month <Icon name="arrow-right" size={16} />
              </a>
            </div>
          ) : (
            <div class="grid gap-5 sm:grid-cols-[1fr_1.1fr] sm:items-end">
              <div>
                <h2 id="safe-title" class="eyebrow">
                  Safe to spend today
                </h2>
                <p class="display mt-3 text-[3.1rem] leading-none sm:text-[3.6rem]">
                  <Money value={s.perDay} code={base} count />
                </p>
                <p class="text-muted mt-3 text-[0.95rem]">
                  a day for the next {plural(s.daysLeft, 'day')}.{' '}
                  <Money value={Math.max(0, s.left)} code={base} class="text-fg font-bold" /> left
                  of your {s.source === 'salary' ? 'salary' : 'budgets'}
                  {s.billsAhead > 0 && (
                    <>
                      , with <Money value={s.billsAhead} code={base} class="text-fg font-bold" /> of
                      bills still to come
                    </>
                  )}
                  .
                </p>
                <div class="mt-4 flex flex-wrap gap-2">
                  {s.pace <= 0 ? (
                    <span class="pill pill-good">
                      <Icon name="check" size={14} /> {formatMoney(-s.pace, base)} under pace
                    </span>
                  ) : (
                    <span class="pill pill-warn">
                      <Icon name="trending-up" size={14} /> {formatMoney(s.pace, base)} over pace
                    </span>
                  )}
                  {s.runsOutOn && (
                    <span class="pill pill-bad">
                      Runs out {formatShort(s.runsOutOn)} at this pace
                    </span>
                  )}
                </div>
              </div>
              <div>
                <BurnDown
                  cycle={s.cycle}
                  allowance={s.allowance}
                  actual={s.actual}
                  projectedEnd={s.projectedEnd}
                  code={base}
                  height={170}
                />
                <p class="text-subtle mt-1 text-xs">
                  {s.projectedEnd >= 0
                    ? `At this pace you finish the month with ${formatMoney(s.projectedEnd, base)} to spare.`
                    : `At this pace the month runs ${formatMoney(-s.projectedEnd, base)} short.`}
                </p>
              </div>
            </div>
          )}
        </section>

        <section
          class="card card-pad animate-rise"
          aria-labelledby="runway-title"
          style={{ animationDelay: '120ms' }}
        >
          <div class="flex items-start justify-between gap-3">
            <h2 id="runway-title" class="eyebrow">
              Runway
            </h2>
            <a href={url('runway/')} class="link inline-flex items-center gap-1 text-sm">
              Open <Icon name="arrow-right" size={15} />
            </a>
          </div>
          {r.mode === 'none' ? null : (
            <>
              <p class="display mt-3 text-[2.1rem] leading-tight">
                {r.lasts
                  ? 'Lasts'
                  : r.mode === 'salary'
                    ? plural(r.periods, 'salary', 'salaries')
                    : formatSpan(today, r.runOut ?? today)}
                <span class="text-muted block font-sans text-[0.95rem] font-semibold tracking-normal">
                  {r.lasts
                    ? 'Income covers what you take out'
                    : r.mode === 'salary'
                      ? `left in savings, until ${formatMonth(r.lastFull ?? today)}`
                      : 'at your average month'}
                </span>
              </p>
              <div class="mt-4">
                <RunwayChart
                  points={r.points}
                  floor={r.floor}
                  target={r.target}
                  runOut={r.runOut}
                  code={base}
                  height={110}
                  label="Savings over time"
                  compact
                />
              </div>
              <p class="text-muted mt-3 text-sm">
                <Money value={r.start} code={base} class="text-fg font-bold" /> in savings.{' '}
                {r.target &&
                  (r.target.status === 'reaches' ? (
                    <span class="text-good">
                      Reaches “{r.target.label}” with {formatMoney(r.target.surplus, base)} to
                      spare.
                    </span>
                  ) : (
                    <span class="text-warn">
                      Falls {plural(r.target.periodsShort || 1, 'month')} short of “{r.target.label}
                      ”.
                    </span>
                  ))}
              </p>
            </>
          )}
        </section>
      </div>

      <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        <section
          class="card card-pad animate-rise"
          aria-labelledby="b-title"
          style={{ animationDelay: '180ms' }}
        >
          <SectionTitle id="b-title" title="Budgets" href="plan/#budgets" link="Plan" />
          {budgets.length ? (
            <div class="grid gap-4">
              {budgets.map((b) => (
                <BudgetRow
                  key={b.budget.categoryId}
                  b={b}
                  cat={cats.get(b.budget.categoryId)}
                  code={base}
                />
              ))}
            </div>
          ) : (
            <p class="text-muted text-sm">
              No budgets yet.{' '}
              <a class="link" href={url('plan/#budgets')}>
                Add one
              </a>{' '}
              for the things that drift, like eating out.
            </p>
          )}
        </section>

        <section
          class="card card-pad animate-rise"
          aria-labelledby="u-title"
          style={{ animationDelay: '220ms' }}
        >
          <SectionTitle id="u-title" title="Coming up" href="plan/#recurring" link="Recurring" />
          {soon.length ? (
            <div class="divide">
              {soon.map((u) => (
                <UpcomingRow
                  key={u.recurring.id + u.date}
                  u={u}
                  cat={u.recurring.categoryId ? cats.get(u.recurring.categoryId) : undefined}
                  code={accounts.get(u.recurring.accountId)?.currency ?? base}
                  today={today}
                />
              ))}
            </div>
          ) : (
            <p class="text-muted text-sm">Nothing due in the next two weeks.</p>
          )}
        </section>

        <section
          class="card card-pad animate-rise md:col-span-2 lg:col-span-1"
          aria-labelledby="i-title"
          style={{ animationDelay: '260ms' }}
        >
          <SectionTitle id="i-title" title="Worth knowing" href="insights/" link="Insights" />
          {tips.length ? (
            <div class="grid gap-5">
              {tips.map((i) => (
                <InsightCard key={i.id} i={i} compact />
              ))}
            </div>
          ) : (
            <p class="text-muted text-sm">
              Insights appear once there is a few weeks of history to compare.
            </p>
          )}
        </section>
      </div>

      <section
        class="card card-pad animate-rise"
        aria-labelledby="r-title"
        style={{ animationDelay: '300ms' }}
      >
        <SectionTitle id="r-title" title="Recent" href="activity/" link="All activity" />
        {recent.length ? (
          <div class="grid gap-0.5 md:grid-cols-2 md:gap-x-8">
            {recent.map((t) => (
              <TxnRow
                key={t.id}
                t={t}
                data={data}
                cats={cats}
                accounts={accounts}
                today={today}
                showDate
              />
            ))}
          </div>
        ) : (
          <Empty
            icon="activity"
            title="Nothing yet"
            body="Add what you spend with the + button, or import a bank statement to fill in the past months."
          >
            <button type="button" class="btn btn-gold btn-sm" onClick={() => openTxn()}>
              <Icon name="plus" size={16} /> Add a transaction
            </button>
            <a href={url('import/')} class="btn btn-soft btn-sm">
              Import a statement
            </a>
          </Empty>
        )}
      </section>
    </div>
  );
}

function Welcome({
  onSetup,
  today,
  setup,
  closeSetup,
}: {
  onSetup: () => void;
  today: string;
  setup: boolean;
  closeSetup: () => void;
}) {
  return (
    <div class="mx-auto grid max-w-3xl gap-6 py-4 sm:py-10">
      <div class="animate-rise text-center">
        <h1 class="display text-[2.4rem] sm:text-[3.2rem]">
          Your money, planned a month at a time.
        </h1>
        <p class="text-muted mx-auto mt-4 max-w-xl text-lg">
          Pay yourself a salary from your savings, see how long they last, and know what is safe to
          spend today. Everything stays on this device.
        </p>
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          class="card card-pad card-glow animate-rise text-left transition hover:-translate-y-0.5"
          onClick={onSetup}
          style={{ animationDelay: '80ms' }}
        >
          <span class="tile">
            <Icon name="zap" />
          </span>
          <h2 class="mt-4 font-bold">Set up in a minute</h2>
          <p class="text-muted mt-1 text-sm">
            Two balances, a salary and a date. That is all it takes.
          </p>
        </button>
        <a
          href={url('import/')}
          class="card card-pad animate-rise transition hover:-translate-y-0.5"
          style={{ animationDelay: '140ms' }}
        >
          <span class="tile" style={{ '--tile': 'oklch(70% 0.12 200)' }}>
            <Icon name="upload" />
          </span>
          <h2 class="mt-4 font-bold">Import a statement</h2>
          <p class="text-muted mt-1 text-sm">
            A PDF or CSV from your bank, read on this device. Nothing is uploaded.
          </p>
        </a>
        <button
          type="button"
          class="card card-pad animate-rise text-left transition hover:-translate-y-0.5"
          onClick={loadDemo}
          style={{ animationDelay: '200ms' }}
        >
          <span class="tile" style={{ '--tile': 'oklch(70% 0.12 300)' }}>
            <Icon name="sparkle" />
          </span>
          <h2 class="mt-4 font-bold">Explore with demo data</h2>
          <p class="text-muted mt-1 text-sm">
            Five months of a made-up student's money. Clear it any time.
          </p>
        </button>
      </div>
      <p class="animate-rise text-subtle text-center text-sm" style={{ animationDelay: '260ms' }}>
        Coming back from another device?{' '}
        <a class="link" href={url('settings/#data')}>
          Restore a backup
        </a>
        .
      </p>
      <SetupSheet open={setup} onClose={closeSetup} today={today} />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div class="grid gap-5" aria-busy="true" aria-label="Loading">
      <h1 class="sr-only">Home</h1>
      <Skeleton class="h-14 w-72" />
      <div class="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton class="h-72 rounded-3xl" />
        <Skeleton class="h-72 rounded-3xl" />
      </div>
      <div class="grid gap-5 md:grid-cols-3">
        <Skeleton class="h-56 rounded-3xl" />
        <Skeleton class="h-56 rounded-3xl" />
        <Skeleton class="h-56 rounded-3xl" />
      </div>
    </div>
  );
}
