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
import { RoadView, roadHorizon } from '../charts/RoadView';
import { RunwayChart } from '../charts/RunwayChart';
import { AmountInput, Empty, Field, Skeleton, fromInput, toInput } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { useLedger, useMedia, useToday } from '../ui/hooks';

export default function RunwayScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const phone = useMedia('(max-width: 639px)');
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

  if (!ready || !plan)
    return (
      <div aria-busy="true">
        <h1 class="sr-only">Runway</h1>
        <Skeleton class="h-[34rem]" />
      </div>
    );
  if (plan.mode === 'none')
    return (
      <Empty
        level={1}
        icon="runway"
        title="No road to draw yet"
        body="Tell Ledger what you have saved and what you pay yourself, and it will lay out how far that carries you."
      >
        <a class="btn btn-primary btn-sm" href={url('home/')}>
          Start in a minute
        </a>
      </Empty>
    );

  const view = tried ?? plan;
  const t = view.target;
  const salaryMode = plan.mode === 'salary';
  const max = Math.max(plan.monthly * 2, (plan.target?.sustainable ?? 0) * 1.4, 100 * unit);
  const step = exp === 3 ? 5000 : 5 * unit;
  const value = trial ?? plan.monthly;
  // The road always shows the same stretch of time, so a different salary visibly moves its end:
  // far enough that the end of the road and your date sit in the middle distance.
  const horizon = roadHorizon(today, plan.runOut, plan.target?.date);

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

  const headline = view.lasts ? (
    <>
      Your savings <em>keep up with you.</em>
    </>
  ) : (
    <>
      Your savings carry you to{' '}
      <em class="whitespace-nowrap">{formatMonth(view.lastFull ?? view.runOut ?? today)}.</em>
    </>
  );
  const sub = view.lasts
    ? 'What comes in covers what you take out, so the road runs past the horizon.'
    : salaryMode
      ? `${plural(view.periods, 'salary', 'salaries')} of ${formatMoney(view.monthly, base)} from ${formatMoney(view.start, base)} in savings.`
      : `At your average month, ${formatMoney(view.monthly, base)} more goes out than comes in. That is ${formatSpan(today, view.runOut ?? today)} of road.`;

  return (
    <div class="grid grid-cols-1 gap-12">
      <section aria-labelledby="rw-title" class="animate-rise">
        <p class="caps">
          Runway ·{' '}
          {salaryMode ? 'savings, paying your salary' : 'all your money, at your average month'}
        </p>
        <h1
          id="rw-title"
          class="display [&_em]:text-gold-ink mt-3 max-w-[20ch] text-[2.6rem] sm:text-[4rem]"
        >
          {headline}
        </h1>
        <p class="serif text-muted mt-4 max-w-2xl text-[1.2rem] italic">
          {sub}
          {t &&
            !view.lasts &&
            (t.status === 'reaches'
              ? ` You pass “${t.label}” with ${formatMoney(t.surplus, base)} to spare.`
              : ` The road ends before “${t.label}”.`)}
        </p>
        {view.missing.length > 0 && (
          <p class="border-warn text-warn mt-4 border-l-2 pl-3 text-sm font-bold">
            {view.missing.map((a) => a.name).join(', ')} {view.missing.length === 1 ? 'is' : 'are'}{' '}
            not counted yet: add a rate for{' '}
            {[...new Set(view.missing.map((a) => a.currency))].join(', ')} in{' '}
            <a class="underline" href={url('settings/#rates')}>
              Settings
            </a>
            .
          </p>
        )}
        <div class="-mx-1 mt-8">
          <RoadView
            today={today}
            horizon={horizon}
            runOut={view.lasts ? null : view.runOut}
            lastFull={view.lastFull}
            target={plan.target}
            start={view.start}
            code={base}
            height={phone ? 230 : 330}
            compact={phone}
          />
        </div>

        {salaryMode && (
          <div class="border-line mt-2 grid gap-5 border-t pt-6 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-10">
            <div>
              <label for="whatif" id="whatif-title" class="caps block">
                Pay yourself
              </label>
              <p class="figure mt-2 text-[2.6rem]">
                <Money value={value} code={base} />
              </p>
            </div>
            <div>
              <input
                id="whatif"
                type="range"
                class="road-slider w-full"
                min={step}
                max={Math.ceil(max / step) * step}
                step={step}
                value={value}
                aria-valuetext={`${formatMoney(value, base)} a month`}
                onInput={(e) => setTrial(Number((e.target as HTMLInputElement).value))}
              />
              <p class="text-subtle mt-2 text-sm" aria-live="polite">
                {tried
                  ? tried.lasts
                    ? 'At this salary the road runs past the horizon.'
                    : `${plural(tried.periods, 'salary', 'salaries')}, to ${formatMonth(tried.lastFull ?? today)}: ${tried.periods >= plan.periods ? `${plural(tried.periods - plan.periods, 'month')} more road` : `${plural(plan.periods - tried.periods, 'month')} less road`}.${tried.target ? (tried.target.status === 'reaches' ? ' You still reach your date.' : ' You would not reach your date.') : ''}`
                  : 'Drag to see the road grow or shrink. Nothing changes until you choose.'}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              {tried ? (
                <>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
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
                    Use this salary
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" onClick={() => setTrial(null)}>
                    Reset
                  </button>
                </>
              ) : (
                plan.target?.sustainable != null &&
                Math.abs(plan.target.sustainable - plan.monthly) >= unit && (
                  <button
                    type="button"
                    class="btn btn-soft btn-sm"
                    onClick={() => setTrial(floorTo(plan.target!.sustainable!, unit))}
                  >
                    Try {formatMoney(floorTo(plan.target.sustainable, unit), base)}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </section>

      <div class="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        <section
          aria-labelledby="target-title"
          class="animate-rise"
          style={{ animationDelay: '80ms' }}
        >
          <div class="border-fg flex items-baseline justify-between gap-3 border-b-2 pb-2">
            <h2 id="target-title" class="serif text-[1.6rem] font-[480]">
              {plan.target ? plan.target.label : 'A date to reach'}
            </h2>
            <button type="button" class="link text-sm" onClick={() => setTargetOpen(true)}>
              {plan.target ? 'Change' : 'Set a date'}
            </button>
          </div>
          {t ? (
            <dl class="mt-1">
              <Line
                k="The date"
                v={<span class="serif text-[1.15rem]">{formatLong(t.date)}</span>}
                note={`${formatSpan(today, t.date)} from today`}
              />
              <Line
                k="Savings on that day"
                v={<Money value={t.balanceAt} code={base} class="text-[1.15rem]" />}
              />
              <Line
                k={t.status === 'reaches' ? 'To spare' : 'Short by'}
                v={
                  <Money
                    value={Math.abs(t.surplus)}
                    code={base}
                    class={`text-[1.15rem] ${t.status === 'reaches' ? 'text-good' : 'text-bad'}`}
                  />
                }
                note={t.floor ? `above your floor of ${formatMoney(t.floor, base)}` : undefined}
              />
              {t.sustainable !== null && (
                <Line
                  k={
                    salaryMode
                      ? 'The most you can pay yourself'
                      : 'The most you can overspend a month'
                  }
                  v={<Money value={t.sustainable} code={base} class="text-[1.45rem] font-[520]" />}
                  total
                />
              )}
            </dl>
          ) : (
            <p class="text-muted mt-4 max-w-md">
              Graduation, a new job, the month income starts again. Pick the day your savings have
              to reach, and Ledger tells you what salary gets you there.
            </p>
          )}
        </section>

        <section
          aria-labelledby="ev-title"
          class="animate-rise"
          style={{ animationDelay: '140ms' }}
        >
          <div class="border-fg border-b-2 pb-2">
            <h2 id="ev-title" class="serif text-[1.6rem] font-[480]">
              Along the way
            </h2>
          </div>
          {flows.length ? (
            <dl class="mt-1">
              {flows.map((f) => (
                <Line
                  key={f.label}
                  k={f.label}
                  note={
                    f.count > 1
                      ? `${f.cadence}, from ${formatShort(f.first, today)}`
                      : formatShort(f.first, today)
                  }
                  v={
                    <Money
                      value={f.delta}
                      code={base}
                      sign="always"
                      tone={f.delta > 0 ? 'income' : 'none'}
                      class="text-[1.1rem]"
                    />
                  }
                />
              ))}
            </dl>
          ) : (
            <p class="text-muted mt-4 max-w-md">
              Nothing else is planned on your savings. A job that starts later, or a yearly bill,
              belongs in{' '}
              <a class="link" href={url('plan/#recurring')}>
                Plan
              </a>{' '}
              so the road knows about it.
            </p>
          )}
        </section>
      </div>

      <section
        class="card card-pad animate-rise"
        aria-labelledby="exact-title"
        style={{ animationDelay: '200ms' }}
      >
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="exact-title" class="serif text-[1.35rem] font-[480]">
            The figures behind the road
          </h2>
          <span class="text-subtle text-sm">
            Every payday and planned flow, step by step. Arrow keys move through it.
          </span>
        </div>
        <RunwayChart
          points={plan.points}
          compare={tried?.points}
          floor={plan.floor}
          target={plan.target}
          runOut={view.runOut}
          code={base}
          label="Savings over time"
          height={phone ? 220 : 260}
        />
      </section>

      <TargetSheet open={targetOpen} onClose={() => setTargetOpen(false)} today={today} />
    </div>
  );
}

function Line({
  k,
  v,
  note,
  total,
}: {
  k: string;
  v: preact.ComponentChildren;
  note?: string;
  total?: boolean;
}) {
  return (
    <div
      class={`flex items-baseline justify-between gap-4 py-3 ${total ? 'rule-double' : 'border-line border-b'}`}
    >
      <dt>
        <span class={total ? 'font-bold' : ''}>{k}</span>
        {note && <span class="text-subtle block text-sm">{note}</span>}
      </dt>
      <dd class="text-right">{v}</dd>
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
      description="Ledger checks your savings reach this day without dipping below the cushion you keep."
      footer={
        <>
          {t && (
            <button
              type="button"
              class="btn btn-danger mr-auto"
              onClick={() => {
                apply(setTarget(null), 'Remove target');
                onClose();
                toast({ message: 'Date removed', action: { label: 'Undo', run: () => undo() } });
              }}
            >
              <Icon name="trash" size={17} /> Remove
            </button>
          )}
          <button
            type="button"
            class="btn btn-primary"
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
              toast({ message: 'Saved. The flag is on the road.', tone: 'good' });
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
          hint="A cushion for the unexpected. The plan leaves it alone."
        >
          <AmountInput id="tg-floor" value={floor} onInput={setFloor} code={base} />
        </Field>
      </div>
    </Sheet>
  );
}
