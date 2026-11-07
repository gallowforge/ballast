import { useState } from 'preact/hooks';
import { addMonths, cycleOf, formatLong, formatMonth, formatSpan, ordinal, type ISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import { runway } from '@/lib/calc/runway';
import { uid } from '@/lib/ids';
import { emptyData } from '@/lib/defaults';
import type { LedgerData } from '@/lib/model';
import { addAccount, setSalary, setSettings, setTarget } from '@/lib/store/ops';
import { apply, getState } from '@/lib/store/store';
import { toast } from '@/lib/bus';
import { protect } from '@/lib/client';
import { AmountInput, Field, Switch, fromInput } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';

/** First run in three short steps: your money, a salary from savings, and a date to reach. */
export function SetupSheet({ open, onClose, today }: { open: boolean; onClose: () => void; today: ISODate }) {
  const base = getState().settings.base;
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [savings, setSavings] = useState('');
  const [spending, setSpending] = useState('');
  const [wantSalary, setWantSalary] = useState(true);
  const [salary, setSalaryText] = useState('');
  const [payday, setPayday] = useState(1);
  const [wantTarget, setWantTarget] = useState(true);
  const [date, setDate] = useState(addMonths(cycleOf(today, 1).start, 18));
  const [label, setLabel] = useState('Until graduation');
  const [floor, setFloor] = useState('');

  const sav = fromInput(savings, base) ?? 0;
  const sal = fromInput(salary, base);

  // A live preview, computed exactly as the app will.
  const preview = (() => {
    if (!wantSalary || !sal || !sav) return null;
    const d: LedgerData = {
      ...emptyData(),
      settings: { ...emptyData().settings, cycleDay: payday },
      accounts: [
        { id: 's', name: 'Savings', role: 'savings', currency: base, opening: sav, openedOn: today },
        { id: 'c', name: 'Current', role: 'spending', currency: base, opening: 0, openedOn: today },
      ],
      salary: { active: true, amount: sal, fromAccountId: 's', toAccountId: 'c', autoPost: true, startedOn: today, lastPostedOn: cycleOf(today, payday).start },
      target: wantTarget ? { date, floor: fromInput(floor, base) ?? 0, label } : null,
    };
    return runway(d, today);
  })();

  const finish = () => {
    const s = uid('a');
    const c = uid('a');
    apply(setSettings({ name: name.trim(), cycleDay: payday, onboarded: true, demo: false }));
    apply(addAccount({ id: s, name: 'Savings', role: 'savings', currency: base, opening: sav, openedOn: today }));
    apply(addAccount({ id: c, name: 'Current account', role: 'spending', currency: base, opening: fromInput(spending, base) ?? 0, openedOn: today }));
    if (wantSalary && sal)
      apply(setSalary({ active: true, amount: sal, fromAccountId: s, toAccountId: c, autoPost: true, startedOn: today, lastPostedOn: cycleOf(today, payday).start }));
    if (wantTarget) apply(setTarget({ date, floor: fromInput(floor, base) ?? 0, label: label.trim() || 'Target' }));
    void protect();
    onClose();
    toast({ message: 'All set. Add what you spend as you go, or import a statement.', tone: 'good' });
  };

  const steps = ['Your money', 'Pay yourself', 'A date to reach'];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={steps[step]!}
      description={`Step ${step + 1} of 3`}
      footer={
        <>
          {step > 0 && (
            <button type="button" class="btn btn-ghost mr-auto" onClick={() => setStep(step - 1)}>
              <Icon name="chevron-left" size={18} /> Back
            </button>
          )}
          {step < 2 ? (
            <button type="button" class="btn btn-gold" onClick={() => setStep(step + 1)}>
              Next <Icon name="arrow-right" size={18} />
            </button>
          ) : (
            <button type="button" class="btn btn-gold" onClick={finish}>
              <Icon name="check" size={18} /> Start
            </button>
          )}
        </>
      }
    >
      <div class="mb-5 flex gap-1.5" aria-hidden="true">
        {steps.map((_, i) => (
          <span key={i} class={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-gold' : 'bg-sunken'}`} />
        ))}
      </div>
      {step === 0 && (
        <div class="grid gap-5">
          <p class="text-muted">Two balances are enough to start. You can add more accounts, other currencies and history later.</p>
          <Field id="setup-savings" label="Savings today" hint="What you are living on: the money a monthly salary will come from.">
            <AmountInput id="setup-savings" value={savings} onInput={setSavings} code={base} big />
          </Field>
          <Field id="setup-spending" label="Spending account today" hint="The account you pay with day to day.">
            <AmountInput id="setup-spending" value={spending} onInput={setSpending} code={base} />
          </Field>
          <Field id="setup-name" label="Your first name (optional)" hint="Only used to greet you.">
            <input id="setup-name" class="input" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} autoComplete="given-name" />
          </Field>
        </div>
      )}
      {step === 1 && (
        <div class="grid gap-5">
          <Switch checked={wantSalary} onChange={setWantSalary} label="Pay myself a monthly salary" hint="On payday Ledger moves it from savings to spending, and plans the month around it." />
          {wantSalary && (
            <>
              <Field id="setup-salary" label="Monthly salary">
                <AmountInput id="setup-salary" value={salary} onInput={setSalaryText} code={base} big />
              </Field>
              <Field id="setup-payday" label="Payday" hint={`Your money month runs from the ${ordinal(payday)} to the day before the next one. This month counts as paid; the first salary moves on the next payday.`}>
                <select id="setup-payday" class="select" value={payday} onChange={(e) => setPayday(Number((e.target as HTMLSelectElement).value))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option value={d} key={d}>
                      The {ordinal(d)} of each month
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
      )}
      {step === 2 && (
        <div class="grid gap-5">
          <Switch checked={wantTarget} onChange={setWantTarget} label="Plan toward a date" hint="Graduation, a new job, the day income starts again." />
          {wantTarget && (
            <>
              <div class="grid gap-4 sm:grid-cols-2">
                <Field id="setup-label" label="Call it">
                  <input id="setup-label" class="input" value={label} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} />
                </Field>
                <Field id="setup-date" label="Date">
                  <input id="setup-date" type="date" class="input" value={date} min={today} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
                </Field>
              </div>
              <Field id="setup-floor" label="Keep at least (optional)" hint="A cushion the plan never touches.">
                <AmountInput id="setup-floor" value={floor} onInput={setFloor} code={base} />
              </Field>
            </>
          )}
          {preview && (
            <div class="rounded-2xl border border-line bg-sunken p-4" aria-live="polite">
              <div class="eyebrow">Your runway</div>
              <p class="mt-1 font-semibold">
                {preview.lasts
                  ? 'Your savings do not run out at this salary.'
                  : `At ${formatMoney(preview.monthly, base)} a month, your savings pay ${preview.periods} more salaries, until ${formatMonth(preview.lastFull ?? today)} (${formatSpan(today, preview.runOut ?? today)}).`}
              </p>
              {preview.target && (
                <p class="mt-1 text-sm text-muted">
                  {preview.target.status === 'reaches'
                    ? `That reaches ${formatLong(preview.target.date)} with ${formatMoney(preview.target.surplus, base)} to spare.`
                    : `That falls short of ${formatLong(preview.target.date)}. Up to ${formatMoney(preview.target.sustainable ?? 0, base)} a month would reach it.`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
