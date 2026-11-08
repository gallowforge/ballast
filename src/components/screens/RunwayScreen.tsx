import { useMemo, useState } from 'preact/hooks';
import { formatLong, formatMonth, formatShort, formatSpan, plural } from '@/lib/dates';
import { floorTo, formatMoney } from '@/lib/money/money';
import { currency } from '@/lib/money/currency';
import { runway } from '@/lib/calc/runway';
import { describeCadence } from '@/lib/calc/recurring';
import { setSalary, setTarget } from '@/lib/store/ops';
import { apply, undo } from '@/lib/store/store';
import { toast } from '@/lib/bus';
import { url } from '@/lib/site';
import { RunwayChart } from '../charts/RunwayChart';
import { AmountInput, Empty, Field, Skeleton, fromInput, toInput } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { useLedger, useToday } from '../ui/hooks';

export default function RunwayScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const base = data.settings.base;
  const exp = currency(base).exp;
  const unit = 10 ** exp;
  const [trial, setTrial] = useState<number | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);

  const plan = useMemo(() => (ready ? runway(data, today) : null), [data, today, ready]);
  const tried = useMemo(
    () =>
      ready && trial !== null && plan?.mode === 'salary'
        ? runway(data, today, { salary: trial })
        : null,
    [data, today, trial, ready],
  );

  if (!ready || !plan) return <Skeleton class="h-[34rem] rounded-3xl" />;
  if (plan.mode === 'none')
    return (
      <div class="card">
        <Empty
          level={2}
          icon="runway"
          title="Nothing to project yet"
          body="Add your savings and a monthly salary, and Ledger shows how long they last and what you can afford until a date that matters."
        >
          <a class="btn btn-gold btn-sm" href={url('home/')}>
            Set up
          </a>
        </Empty>
      </div>
    );

  const view = tried ?? plan;
  const t = view.target;
  const flows = (() => {
    const by = new Map<
      string,
      { label: string; delta: number; first: string; count: number; cadence: string }
    >();
    for (const e of view.events) {
      if (e.kind === 'salary' || e.kind === 'burn') continue;
      const row = by.get(e.label);
      if (row) row.count++;
      else {
        const r = data.recurring.find((x) => x.name === e.label);
        by.set(e.label, {
          label: e.label,
          delta: e.delta,
          first: e.date,
          count: 1,
          cadence: r ? describeCadence(r) : 'repeats',
        });
      }
    }
    return [...by.values()].slice(0, 8);
  })();
  const salaryMode = plan.mode === 'salary';
  const max = Math.max(plan.monthly * 2, (plan.target?.sustainable ?? 0) * 1.4, 100 * unit);
  const step = exp === 3 ? 5000 : 5 * unit;
  const value = trial ?? plan.monthly;

  const headline = view.lasts
    ? 'Your savings keep up'
    : salaryMode
      ? `${plural(view.periods, 'salary', 'salaries')} left`
      : `About ${formatSpan(today, view.runOut ?? today)} left`;
  const sub = view.lasts
    ? 'Money coming in covers what you take out, so savings do not run out in the next ten years.'
    : salaryMode
      ? `At ${formatMoney(view.monthly, base)} a month, the last full salary is in ${formatMonth(view.lastFull ?? today)}.`
      : `At your average month (${formatMoney(view.monthly, base)} more out than in), money falls below your floor in ${formatMonth(view.runOut ?? today)}.`;

  return (
    <div class="grid grid-cols-1 gap-6">
      <section class="card card-pad card-glow animate-rise" aria-labelledby="rw-title">
        <div class="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p class="eyebrow">
              {salaryMode ? 'Savings, paying your salary' : 'All your money, at your average month'}
            </p>
            <h2 id="rw-title" class="display mt-3 text-[2.6rem] sm:text-[3.3rem]">
              {headline}
            </h2>
            <p class="text-muted mt-3 max-w-2xl">{sub}</p>
          </div>
          <div class="grid grid-cols-2 gap-x-8 gap-y-1 text-sm lg:text-right">
            <span class="text-muted">{salaryMode ? 'In savings' : 'In your accounts'}</span>
            <span class="text-muted">{salaryMode ? 'Each month' : 'Net each month'}</span>
            <Money value={view.start} code={base} class="text-xl font-bold" />
            <Money value={-view.monthly} code={base} class="text-xl font-bold" />
          </div>
        </div>
        {view.missing.length > 0 && (
          <p class="bg-warn-soft text-warn mt-4 rounded-2xl px-4 py-3 text-sm font-semibold">
            {view.missing.map((a) => a.name).join(', ')} {view.missing.length === 1 ? 'is' : 'are'}{' '}
            left out: add a rate for {[...new Set(view.missing.map((a) => a.currency))].join(', ')}{' '}
            in{' '}
            <a class="underline" href={url('settings/#rates')}>
              Settings
            </a>
            .
          </p>
        )}
        <div class="mt-6">
          <RunwayChart
            points={plan.points}
            compare={tried?.points}
            floor={plan.floor}
            target={plan.target}
            runOut={view.runOut}
            code={base}
            label="Savings over time"
          />
        </div>
        <div class="text-subtle mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold">
          <span class="inline-flex items-center gap-1.5">
            <i class="bg-gold h-0.5 w-5 rounded" /> Your plan
          </span>
          {tried && (
            <span class="inline-flex items-center gap-1.5">
              <i class="border-fg/60 h-0 w-5 border-t-2 border-dashed" /> Trying{' '}
              {formatMoney(value, base)}
            </span>
          )}
          {plan.floor > 0 && (
            <span class="inline-flex items-center gap-1.5">
              <i class="border-bad/70 h-0 w-5 border-t-2 border-dashed" /> Floor
            </span>
          )}
          <span>Use the arrow keys on the chart to step through it.</span>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <section
          class="card card-pad animate-rise"
          aria-labelledby="target-title"
          style={{ animationDelay: '60ms' }}
        >
          <div class="flex items-start justify-between gap-3">
            <h2 id="target-title" class="eyebrow">
              Your target
            </h2>
            <button type="button" class="btn btn-soft btn-sm" onClick={() => setTargetOpen(true)}>
              <Icon name={plan.target ? 'edit' : 'plus'} size={16} />{' '}
              {plan.target ? 'Change' : 'Set a date'}
            </button>
          </div>
          {t ? (
            <>
              <h3 class="display mt-3 text-[1.9rem]">{t.label}</h3>
              <p class="text-muted">
                {formatLong(t.date)} · {formatSpan(today, t.date)} away
              </p>
              <div
                class={`mt-5 rounded-2xl p-4 ${t.status === 'reaches' ? 'bg-good-soft' : 'bg-warn-soft'}`}
              >
                <p
                  class={`flex items-start gap-2 font-bold ${t.status === 'reaches' ? 'text-good' : 'text-warn'}`}
                >
                  <Icon
                    name={t.status === 'reaches' ? 'check' : 'alert'}
                    size={19}
                    class="mt-0.5 flex-none"
                  />
                  {t.status === 'reaches'
                    ? `You get there with ${formatMoney(t.surplus, base)} to spare${t.floor ? ' above your floor' : ''}.`
                    : `You run short ${plural(Math.max(1, t.periodsShort), salaryMode ? 'payday' : 'month')} before it: ${formatMoney(-t.surplus, base)} too little.`}
                </p>
              </div>
              {t.sustainable !== null && (
                <div class="mt-5">
                  <p class="text-muted text-sm">
                    {salaryMode
                      ? 'The most you can pay yourself and still get there'
                      : 'The most you can spend beyond your income each month'}
                  </p>
                  <p class="display mt-1 text-[2.2rem]">
                    <Money value={t.sustainable} code={base} />
                    <span class="text-muted font-sans text-base font-semibold tracking-normal">
                      {' '}
                      a month
                    </span>
                  </p>
                  {salaryMode && Math.abs(t.sustainable - plan.monthly) >= unit && (
                    <button
                      type="button"
                      class="btn btn-soft btn-sm mt-3"
                      onClick={() => setTrial(floorTo(t.sustainable!, unit))}
                    >
                      Try {formatMoney(floorTo(t.sustainable, unit), base)}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p class="text-muted mt-3">
              Graduation, a new job, the month income starts again: pick the date your savings have
              to reach, and Ledger tells you what salary gets you there.
            </p>
          )}
        </section>

        {salaryMode ? (
          <section
            class="card card-pad animate-rise"
            aria-labelledby="whatif-title"
            style={{ animationDelay: '120ms' }}
          >
            <h2 id="whatif-title" class="eyebrow">
              What if I paid myself…
            </h2>
            <p class="display mt-3 text-[2.4rem]">
              <Money value={value} code={base} />
            </p>
            <label for="whatif" class="sr-only">
              Monthly salary to try
            </label>
            <input
              id="whatif"
              type="range"
              class="mt-4 w-full accent-[var(--gold)]"
              min={step}
              max={Math.ceil(max / step) * step}
              step={step}
              value={value}
              aria-valuetext={formatMoney(value, base)}
              onInput={(e) => setTrial(Number((e.target as HTMLInputElement).value))}
            />
            <div class="text-subtle flex justify-between text-xs font-semibold">
              <span>{formatMoney(step, base)}</span>
              <span>{formatMoney(Math.ceil(max / step) * step, base)}</span>
            </div>
            {tried ? (
              <div class="mt-5 grid gap-3">
                <p class="font-semibold" aria-live="polite">
                  {tried.lasts
                    ? 'At this salary your savings do not run out.'
                    : `${plural(tried.periods, 'salary', 'salaries')}, until ${formatMonth(tried.lastFull ?? today)}: ${tried.periods >= plan.periods ? `${plural(tried.periods - plan.periods, 'month')} longer` : `${plural(plan.periods - tried.periods, 'month')} sooner`} than now.`}
                  {tried.target &&
                    (tried.target.status === 'reaches'
                      ? ' It reaches your target.'
                      : ' It does not reach your target.')}
                </p>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-gold btn-sm"
                    onClick={() => {
                      apply(setSalary({ ...data.salary!, amount: value }), 'Change salary');
                      setTrial(null);
                      toast({
                        message: `Salary set to ${formatMoney(value, base)} a month`,
                        tone: 'good',
                        action: { label: 'Undo', run: () => undo() },
                      });
                    }}
                  >
                    <Icon name="check" size={16} /> Use this salary
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" onClick={() => setTrial(null)}>
                    Reset
                  </button>
                </div>
              </div>
            ) : (
              <p class="text-muted mt-5 text-sm">
                Drag to see how a different salary changes the chart. Nothing changes until you
                choose to use it.
              </p>
            )}
          </section>
        ) : (
          <section class="card card-pad animate-rise" style={{ animationDelay: '120ms' }}>
            <h2 class="eyebrow">Plan with a salary</h2>
            <p class="text-muted mt-3">
              This projection follows your average month. Paying yourself a fixed salary from
              savings makes it exact, and the month is planned around it.
            </p>
            <a class="btn btn-gold btn-sm mt-4" href={url('plan/#salary')}>
              Set a salary
            </a>
          </section>
        )}
      </div>

      {flows.length > 0 && (
        <section
          class="card card-pad animate-rise"
          aria-labelledby="ev-title"
          style={{ animationDelay: '160ms' }}
        >
          <h2 id="ev-title" class="mb-3 text-[0.95rem] font-bold">
            What else moves your savings
          </h2>
          <div class="divide">
            {flows.map((f) => (
              <div key={f.label} class="flex items-center gap-3 py-2.5">
                <span
                  class="tile tile-sm"
                  style={{ '--tile': f.delta > 0 ? 'var(--good)' : 'var(--warn)' }}
                >
                  <Icon name={f.delta > 0 ? 'arrow-down-left' : 'arrow-up-right'} size={16} />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{f.label}</span>
                  <span class="text-subtle block text-sm">
                    {f.count > 1
                      ? `${f.cadence}, from ${formatShort(f.first, today)}`
                      : formatShort(f.first, today)}
                  </span>
                </span>
                <Money
                  value={f.delta}
                  code={base}
                  sign="always"
                  tone={f.delta > 0 ? 'income' : 'none'}
                  class="text-right font-bold"
                />
              </div>
            ))}
          </div>
          <p class="text-subtle mt-3 text-sm">
            Recurring income and costs on your savings accounts. Add more in{' '}
            <a class="link" href={url('plan/#recurring')}>
              Plan
            </a>
            .
          </p>
        </section>
      )}

      <TargetSheet open={targetOpen} onClose={() => setTargetOpen(false)} today={today} />
    </div>
  );
}

function TargetSheet({
  open,
  onClose,
  today,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
}) {
  const { data } = useLedger();
  const base = data.settings.base;
  const t = data.target;
  const [label, setLabel] = useState(t?.label ?? 'Until graduation');
  const [date, setDate] = useState(t?.date ?? today);
  const [floor, setFloor] = useState(toInput(t?.floor, base));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="A date to reach"
      description="The runway checks your savings reach this date without going below the floor."
      footer={
        <>
          {t && (
            <button
              type="button"
              class="btn btn-danger mr-auto"
              onClick={() => {
                apply(setTarget(null), 'Remove target');
                onClose();
                toast({ message: 'Target removed', action: { label: 'Undo', run: () => undo() } });
              }}
            >
              <Icon name="trash" size={17} /> Remove
            </button>
          )}
          <button
            type="button"
            class="btn btn-gold"
            disabled={!date || date <= today}
            onClick={() => {
              apply(
                setTarget({
                  label: label.trim() || 'Target',
                  date,
                  floor: fromInput(floor, base) ?? 0,
                }),
                'Target',
              );
              onClose();
              toast({ message: 'Target saved', tone: 'good' });
            }}
          >
            <Icon name="check" size={18} /> Save
          </button>
        </>
      }
    >
      <div class="grid gap-5">
        <Field id="tg-label" label="Call it">
          <input
            id="tg-label"
            class="input"
            value={label}
            onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          />
        </Field>
        <Field id="tg-date" label="Date">
          <input
            id="tg-date"
            type="date"
            class="input"
            min={today}
            value={date}
            onInput={(e) => setDate((e.target as HTMLInputElement).value)}
          />
        </Field>
        <Field
          id="tg-floor"
          label="Never go below (optional)"
          hint="An emergency cushion the plan leaves alone."
        >
          <AmountInput id="tg-floor" value={floor} onInput={setFloor} code={base} />
        </Field>
      </div>
    </Sheet>
  );
}
