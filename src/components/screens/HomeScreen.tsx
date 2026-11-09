import { useMemo, useState } from 'preact/hooks';
import {
  addDays,
  addMonths,
  diffDays,
  formatDayLong,
  formatMonth,
  formatShort,
  plural,
} from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import { budgetStates } from '@/lib/calc/budgets';
import { cycleSummary, type CycleSummary } from '@/lib/calc/cycle';
import { insights } from '@/lib/calc/insights';
import { upcoming } from '@/lib/calc/recurring';
import { runway } from '@/lib/calc/runway';
import { accountMap, categoryMap, sortedTxns } from '@/lib/ledger';
import { loadDemo } from '@/lib/client';
import { openTxn } from '@/lib/bus';
import { url } from '@/lib/site';
import { BurnDown } from '../charts/BurnDown';
import { RoadView, roadHorizon } from '../charts/RoadView';
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
import { useLedger, useMedia, useToday } from '../ui/hooks';
import { SetupSheet } from './Setup';

function greeting(name: string): string {
  const h = new Date().getHours();
  const part =
    h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}${name ? `, ${name}` : ''}.`;
}

/** The one sentence under today's figure, in Ledger's voice. */
function verdict(s: CycleSummary, base: string): string {
  if (s.runsOutOn)
    return `is yours today. At this pace the month runs dry on ${formatShort(s.runsOutOn)}; a lighter week puts it right.`;
  if (s.pace > 0)
    return 'is yours today, a little under the usual so the month still ends on its feet.';
  if (s.safe === 0) return 'is what remains. The month is spent, and payday is close.';
  return `is yours to spend today, and the month still ends calmly${s.projectedEnd > 0 ? ` with about ${formatMoney(s.projectedEnd, base)} to spare` : ''}.`;
}

export default function HomeScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const phone = useMedia('(max-width: 639px)');
  const [setup, setSetup] = useState(false);
  const base = data.settings.base;

  const view = useMemo(() => {
    if (!ready || !data.accounts.length) return null;
    return {
      s: cycleSummary(data, today),
      r: runway(data, today),
      budgets: budgetStates(data, today)
        .sort((a, b) => b.used - a.used)
        .slice(0, 4),
      soon: upcoming(data, addDays(today, 1), addDays(today, 14)).slice(0, 4),
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
  const toPayday = payday ? diffDays(today, payday) : 0;
  const horizon = roadHorizon(today, r.runOut, r.target?.date);

  return (
    <div class="grid grid-cols-1 gap-12 lg:gap-16">
      {data.settings.demo && <DemoBanner />}

      <div class="grid grid-cols-1 gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <section aria-labelledby="hello" class="animate-rise">
          <p class="caps">
            {formatDayLong(today)}
            {payday && (
              <span class="text-gold-ink">
                {' '}
                · payday {toPayday === 1 ? 'tomorrow' : `in ${toPayday} days`}
              </span>
            )}
          </p>
          <h1 id="hello" class="display mt-2 text-[2.2rem] sm:text-[2.8rem]">
            {greeting(data.settings.name)}
          </h1>

          {s.source === 'none' ? (
            <div class="mt-10">
              <p class="figure text-[5rem] sm:text-[6.5rem]">
                <Money value={s.spent} code={base} count />
              </p>
              <p class="serif text-muted mt-4 max-w-[34ch] text-[1.3rem] italic">
                spent since {formatShort(s.cycle.start)}. Give yourself a salary or a few budgets,
                and Ledger will say what is safe to spend each day.
              </p>
              <a href={url('plan/')} class="btn btn-primary mt-6">
                Plan the month
              </a>
            </div>
          ) : (
            <div class="mt-10">
              <h2 id="safe-title" class="caps">
                Safe to spend today
              </h2>
              <p class="figure mt-3 text-[5.2rem] sm:text-[7.5rem]">
                <Money value={s.perDay} code={base} count />
              </p>
              <p class="serif text-muted mt-4 max-w-[30ch] text-[1.3rem] leading-snug italic">
                {verdict(s, base)}
              </p>
              <div class="mt-8">
                <BurnDown
                  cycle={s.cycle}
                  allowance={s.allowance}
                  actual={s.actual}
                  projectedEnd={s.projectedEnd}
                  code={base}
                  height={phone ? 110 : 130}
                />
              </div>
            </div>
          )}
        </section>

        <div class="grid content-start gap-12">
          {s.source !== 'none' && (
            <section
              aria-labelledby="month-title"
              class="animate-rise"
              style={{ animationDelay: '80ms' }}
            >
              <SectionTitle id="month-title" title="This month" />
              <dl>
                <LedgerLine
                  label={s.source === 'salary' ? 'Your salary' : 'Your budgets'}
                  note={`from ${formatShort(s.cycle.start)}`}
                >
                  <Money
                    value={s.allowance}
                    code={base}
                    sign={s.source === 'salary' ? 'always' : 'auto'}
                    tone={s.source === 'salary' ? 'income' : 'none'}
                  />
                </LedgerLine>
                {s.extra > 0 && (
                  <LedgerLine label="Also came in" note="refunds, gifts">
                    <Money value={s.extra} code={base} sign="always" tone="income" />
                  </LedgerLine>
                )}
                <LedgerLine label="Spent so far" note={plural(s.daysGone, 'day')}>
                  <Money value={-s.spent} code={base} />
                </LedgerLine>
                {s.billsAhead > 0 && (
                  <LedgerLine label="Bills still to come" note="kept aside for you">
                    <Money value={-s.billsAhead} code={base} />
                  </LedgerLine>
                )}
                <LedgerLine label="Free to spend" note={`over ${plural(s.daysLeft, 'day')}`} total>
                  <Money value={s.safe} code={base} />
                </LedgerLine>
              </dl>
            </section>
          )}

          {r.mode !== 'none' && (
            <section
              aria-labelledby="road-title"
              class="animate-rise"
              style={{ animationDelay: '140ms' }}
            >
              <SectionTitle
                id="road-title"
                title="The road ahead"
                href="runway/"
                link="Open runway"
              />
              <a href={url('runway/')} class="mt-4 block" aria-label="Open the runway">
                <RoadView
                  today={today}
                  horizon={horizon}
                  runOut={r.lasts ? null : r.runOut}
                  lastFull={r.lastFull}
                  target={r.target}
                  start={r.start}
                  code={base}
                  height={150}
                  compact
                />
              </a>
              <p class="serif mt-4 text-[1.25rem] leading-snug">
                {r.lasts ? (
                  <>Your savings keep up with you.</>
                ) : r.mode === 'salary' ? (
                  <>
                    {plural(r.periods, 'salary', 'salaries')} left, to{' '}
                    <em class="text-gold-ink">{formatMonth(r.lastFull ?? today)}</em>.
                  </>
                ) : (
                  <>
                    At your average month, money lasts to{' '}
                    <em class="text-gold-ink">{formatMonth(r.runOut ?? today)}</em>.
                  </>
                )}
              </p>
              {r.target && (
                <p class="text-subtle mt-1 text-sm">
                  {r.target.status === 'reaches'
                    ? `You pass “${r.target.label}” with ${formatMoney(r.target.surplus, base)} to spare.`
                    : `The road ends ${plural(r.target.periodsShort || 1, 'month')} before “${r.target.label}”.`}
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      <div class="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-14">
        <section
          aria-labelledby="b-title"
          class="animate-rise lg:col-span-2"
          style={{ animationDelay: '200ms' }}
        >
          <SectionTitle id="b-title" title="Budgets" href="plan/#budgets" link="All budgets" />
          {budgets.length ? (
            <div class="grid gap-x-10 sm:grid-cols-2">
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
            <p class="text-muted mt-4 max-w-md">
              No budgets yet. A line for the things that drift, like eating out, keeps them honest.{' '}
              <a class="link" href={url('plan/#budgets')}>
                Draw one
              </a>
              .
            </p>
          )}
        </section>

        <section aria-labelledby="u-title" class="animate-rise" style={{ animationDelay: '240ms' }}>
          <SectionTitle id="u-title" title="Coming up" href="plan/#recurring" link="Recurring" />
          {soon.length ? (
            soon.map((u) => (
              <UpcomingRow
                key={u.recurring.id + u.date}
                u={u}
                cat={u.recurring.categoryId ? cats.get(u.recurring.categoryId) : undefined}
                code={accounts.get(u.recurring.accountId)?.currency ?? base}
                today={today}
              />
            ))
          ) : (
            <p class="text-muted mt-4">Nothing due in the next two weeks. Quiet is good.</p>
          )}
        </section>
      </div>

      <div class="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-14">
        <section
          aria-labelledby="r-title"
          class="animate-rise lg:col-span-2"
          style={{ animationDelay: '280ms' }}
        >
          <SectionTitle id="r-title" title="Recent" href="activity/" link="All activity" />
          {recent.length ? (
            recent.map((t) => (
              <TxnRow
                key={t.id}
                t={t}
                data={data}
                cats={cats}
                accounts={accounts}
                today={today}
                showDate
              />
            ))
          ) : (
            <Empty
              title="A clean page."
              body="Add what you spend with the + button, or bring in a bank statement and let the past months fill in."
            >
              <button type="button" class="btn btn-primary btn-sm" onClick={() => openTxn()}>
                <Icon name="plus" size={16} /> Add a transaction
              </button>
              <a href={url('import/')} class="btn btn-soft btn-sm">
                Import a statement
              </a>
            </Empty>
          )}
        </section>

        <section aria-labelledby="i-title" class="animate-rise" style={{ animationDelay: '320ms' }}>
          <SectionTitle id="i-title" title="In the margin" href="insights/" link="Insights" />
          {tips.length ? (
            <div class="mt-4 grid gap-6">
              {tips.map((i) => (
                <InsightCard key={i.id} i={i} compact />
              ))}
            </div>
          ) : (
            <p class="text-muted mt-4">
              Notes appear here once there are a few weeks to compare. No rush.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function LedgerLine({
  label,
  note,
  total,
  children,
}: {
  label: string;
  note?: string;
  total?: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <div
      class={`flex items-baseline justify-between gap-4 py-2.5 ${total ? 'rule-double' : 'border-line border-b'}`}
    >
      <dt>
        <span class={total ? 'font-bold' : ''}>{label}</span>
        {note && <span class="text-subtle ml-2 text-[0.8rem]">{note}</span>}
      </dt>
      <dd class={`text-right ${total ? 'text-[1.35rem] font-[540]' : 'text-[1.1rem]'}`}>
        {children}
      </dd>
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
  const steps = [
    {
      n: '1',
      title: 'Set up in a minute',
      body: 'Two balances, a salary and a date. That is all it takes.',
      action: onSetup,
    },
    {
      n: '2',
      title: 'Bring in a statement',
      body: 'A PDF or CSV from your bank, read right here. Nothing is uploaded.',
      href: url('import/'),
    },
    {
      n: '3',
      title: 'Look around first',
      body: 'Five months of Alex, who is made up. Clear it whenever you like.',
      action: loadDemo,
    },
  ];
  return (
    <div class="grid grid-cols-1 gap-12 py-2 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-8">
      <div class="animate-rise">
        <p class="caps">Welcome</p>
        <h1 class="display mt-3 text-[2.8rem] sm:text-[4rem]">
          A calm place <em class="text-gold-ink">for your money.</em>
        </h1>
        <p class="serif text-muted mt-5 max-w-[36ch] text-[1.3rem] leading-snug italic">
          Pay yourself a salary from your savings, know what is safe to spend today, and see how far
          the road goes. It all stays on this device.
        </p>
        <ol class="border-fg mt-10 border-t-2">
          {steps.map((s) => {
            const inner = (
              <>
                <span class="figure text-gold-ink w-10 flex-none text-[2rem]">{s.n}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[1.05rem] font-bold">{s.title}</span>
                  <span class="text-muted block">{s.body}</span>
                </span>
                <Icon name="arrow-right" size={20} class="text-subtle flex-none" />
              </>
            );
            return (
              <li key={s.n} class="border-line border-b">
                {s.href ? (
                  <a href={s.href} class="flex items-center gap-4 py-5 transition hover:pl-1">
                    {inner}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={s.action}
                    class="flex w-full items-center gap-4 py-5 text-left transition hover:pl-1"
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <p class="text-subtle mt-5 text-sm">
          Coming from another device?{' '}
          <a class="link" href={url('settings/#data')}>
            Restore a backup
          </a>
          .
        </p>
      </div>
      <div class="hidden self-center lg:block" aria-hidden="true">
        <RoadView
          today={today}
          horizon={addMonths(today, 30)}
          runOut={null}
          target={{ date: addMonths(today, 16), label: 'Your date' }}
          start={0}
          code="KWD"
          height={420}
        />
      </div>
      <SetupSheet open={setup} onClose={closeSetup} today={today} />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div class="grid gap-8" aria-busy="true" aria-label="Loading">
      <h1 class="sr-only">Home</h1>
      <Skeleton class="h-6 w-64" />
      <Skeleton class="h-12 w-80" />
      <Skeleton class="h-40 w-full max-w-xl" />
      <div class="grid gap-8 md:grid-cols-3">
        <Skeleton class="h-48" />
        <Skeleton class="h-48" />
        <Skeleton class="h-48" />
      </div>
    </div>
  );
}
