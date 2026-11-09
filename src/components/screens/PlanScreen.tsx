import { useEffect, useMemo, useState } from 'preact/hooks';
import { addDays, cycleOf, formatLong, formatShort, ordinal, plural } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import { budgetStates, budgetTotals, suggestBudget } from '@/lib/calc/budgets';
import { detectRecurring } from '@/lib/calc/insights';
import { describeCadence, monthlyEquivalent, nextDue, upcoming } from '@/lib/calc/recurring';
import { runway } from '@/lib/calc/runway';
import { accountMap, categoryMap, savingsAccounts, spendingAccounts } from '@/lib/ledger';
import type { Recurring, Salary, Unit } from '@/lib/model';
import {
  addRecurring,
  payRecurring,
  removeBudget,
  removeRecurring,
  setBudget,
  setSalary,
  setSettings,
  updateRecurring,
} from '@/lib/store/ops';
import { apply, undo } from '@/lib/store/store';
import { toast } from '@/lib/bus';
import { currency } from '@/lib/money/currency';
import { url } from '@/lib/site';
import { BudgetRow, SectionTitle, Swatch, UpcomingRow } from '../parts/parts';
import { AmountInput, Empty, Field, Skeleton, Switch, fromInput, toInput } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { useLedger, useToday } from '../ui/hooks';

export default function PlanScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [budgetFor, setBudgetFor] = useState<string | null>(null);
  const [recurring, setRecurring] = useState<Recurring | 'new' | null>(null);
  const base = data.settings.base;
  const cats = useMemo(() => categoryMap(data), [data]);
  const accounts = useMemo(() => accountMap(data), [data]);

  if (!ready) return <Skeleton class="h-[32rem] rounded-md" />;

  const states = budgetStates(data, today);
  const totals = budgetTotals(data, today);
  const s = data.salary;
  // Only costs paid from spending accounts come out of the salary; costs from savings show in the runway.
  const fromSalary = (r: Recurring) => accounts.get(r.accountId)?.role !== 'savings';
  const fixed = data.recurring
    .filter((r) => r.kind === 'expense' && fromSalary(r) && (!r.endOn || r.endOn >= today))
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0);
  const committed = data.budgets.reduce((sum, b) => sum + b.amount, 0) + fixed;
  const r = s?.active ? runway(data, today) : null;
  const suggestions = detectRecurring(data, today);
  const soon = upcoming(data, today, addDays(today, 30));

  return (
    <div class="grid grid-cols-1 gap-14">
      <section class="animate-rise" aria-labelledby="salary-title" id="salary">
        <div class="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-14">
          <div>
            <h2 id="salary-title" class="caps">
              Your salary
            </h2>
            {s?.active ? (
              <p class="figure mt-3 text-[4.4rem] sm:text-[5.6rem]">
                <Money value={s.amount} code={base} count />
              </p>
            ) : (
              <p class="serif mt-3 max-w-[30ch] text-[1.6rem] leading-snug">
                Pay yourself a fixed amount from your savings each month.
              </p>
            )}
          </div>
          <div class="pb-2">
            <p class="serif text-muted text-[1.2rem] leading-snug italic">
              {s?.active
                ? `On the ${ordinal(data.settings.cycleDay)} of every month, from ${accounts.get(s.fromAccountId)?.name ?? 'savings'} to ${accounts.get(s.toAccountId)?.name ?? 'spending'}${s.autoPost ? ', moved for you.' : '. You move it yourself.'}`
                : 'The month is then planned around it, and the runway shows how far it carries you.'}
            </p>
            <button
              type="button"
              class={`btn ${s?.active ? 'btn-soft' : 'btn-primary'} btn-sm mt-4`}
              onClick={() => setSalaryOpen(true)}
            >
              {s?.active ? 'Change the salary' : 'Set a salary'}
            </button>
          </div>
        </div>
        {s?.active && (
          <div class="mt-8">
            <div
              class="bg-sunken relative flex h-10 w-full overflow-hidden rounded-[3px]"
              role="meter"
              aria-label={`Of your ${formatMoney(s.amount, base)} salary, fixed costs take ${formatMoney(fixed, base)} and budgets ${formatMoney(committed - fixed, base)}`}
              aria-valuemin={0}
              aria-valuemax={s.amount}
              aria-valuenow={Math.min(committed, s.amount)}
            >
              <span
                class="border-bg h-full border-r-2"
                style={{
                  width: `${Math.min(100, (fixed / s.amount) * 100)}%`,
                  background:
                    'repeating-linear-gradient(135deg, var(--gold) 0 6px, color-mix(in oklab, var(--gold) 70%, var(--bg)) 6px 12px)',
                }}
              />
              <span
                class="bg-fg h-full"
                style={{
                  width: `${Math.max(0, Math.min(100 - (fixed / s.amount) * 100, ((committed - fixed) / s.amount) * 100))}%`,
                }}
              />
            </div>
            <dl class="mt-3 grid gap-x-10 gap-y-1 text-sm sm:grid-cols-3">
              <div class="border-line flex items-baseline justify-between gap-3 border-b py-2">
                <dt class="flex items-center gap-2">
                  <i class="bg-gold size-2.5" /> Fixed costs
                </dt>
                <dd>
                  <Money value={fixed} code={base} class="text-[1.05rem]" />
                </dd>
              </div>
              <div class="border-line flex items-baseline justify-between gap-3 border-b py-2">
                <dt class="flex items-center gap-2">
                  <i class="bg-fg size-2.5" /> Budgets
                </dt>
                <dd>
                  <Money value={committed - fixed} code={base} class="text-[1.05rem]" />
                </dd>
              </div>
              <div class="border-line flex items-baseline justify-between gap-3 border-b py-2">
                <dt class="flex items-center gap-2">
                  <i class="border-line-strong size-2.5 border" />{' '}
                  {committed <= s.amount ? 'Left unplanned' : 'Over the salary'}
                </dt>
                <dd>
                  <Money
                    value={Math.abs(s.amount - committed)}
                    code={base}
                    class={`text-[1.05rem] ${committed > s.amount ? 'text-bad' : ''}`}
                  />
                </dd>
              </div>
            </dl>
            {r?.target?.sustainable != null && (
              <p class="text-muted mt-4 text-sm">
                To reach “{r.target.label}” on {formatLong(r.target.date)}, you could pay yourself
                up to{' '}
                <a href={url('runway/')} class="link">
                  {formatMoney(r.target.sustainable, base)} a month
                </a>
                .
              </p>
            )}
          </div>
        )}
      </section>

      <section
        class="animate-rise"
        aria-labelledby="budgets-title"
        id="budgets"
        style={{ animationDelay: '60ms' }}
      >
        <SectionTitle id="budgets-title" title="Budgets">
          <button type="button" class="link ml-auto text-sm" onClick={() => setBudgetFor('')}>
            Draw a new line
          </button>
        </SectionTitle>
        <p class="text-subtle mt-2 text-sm">
          {data.budgets.length
            ? `${formatMoney(totals.spent, base)} spent of ${formatMoney(totals.budgeted, base)} this month.${totals.unbudgeted ? ` Another ${formatMoney(totals.unbudgeted, base)} went on things with no line.` : ''} The brass tick is where an even pace would be today.`
            : 'A line for the things that drift. Ledger suggests one from your last three months.'}
        </p>
        {states.length ? (
          <div class="mt-2 grid gap-x-12 md:grid-cols-2">
            {states.map((b) => (
              <button
                type="button"
                key={b.budget.categoryId}
                class="border-line hover:bg-sunken/50 border-b text-left transition"
                onClick={() => setBudgetFor(b.budget.categoryId)}
              >
                <BudgetRow b={b} cat={cats.get(b.budget.categoryId)} code={base} />
                {b.carry !== 0 && (
                  <p class="text-subtle -mt-2 pb-2 text-xs">
                    Includes {formatMoney(b.carry, base, { sign: 'always' })} rolled over
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="No lines drawn yet."
            body="Pick a category and a monthly amount, like 25 KD for eating out. Ledger keeps an eye on the pace for you."
          />
        )}
      </section>

      <div class="grid grid-cols-1 gap-12 lg:grid-cols-[1.5fr_1fr] lg:gap-14" id="recurring">
        <section
          class="animate-rise"
          aria-labelledby="rec-title"
          style={{ animationDelay: '120ms' }}
        >
          <SectionTitle id="rec-title" title="What repeats">
            <button type="button" class="link ml-auto text-sm" onClick={() => setRecurring('new')}>
              Add one
            </button>
          </SectionTitle>
          <p class="text-subtle mt-2 text-sm">
            Bills, subscriptions and regular income.
            {fixed
              ? ` The costs from your salary come to ${formatMoney(fixed, base)} a month.`
              : ''}
          </p>
          {data.recurring.length ? (
            <div class="mt-1">
              {[...data.recurring]
                .sort((a, b) => ((nextDue(a, today) ?? '9') < (nextDue(b, today) ?? '9') ? -1 : 1))
                .map((r) => {
                  const next = nextDue(r, today);
                  const code = accounts.get(r.accountId)?.currency ?? base;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      class="row-link items-baseline"
                      onClick={() => setRecurring(r)}
                    >
                      <span class="caps w-16 flex-none">
                        {next ? formatShort(next, today) : 'ended'}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="flex items-center gap-2 truncate font-bold">
                          <Swatch category={r.categoryId ? cats.get(r.categoryId) : null} />
                          {r.name}
                        </span>
                        <span class="text-subtle block truncate text-[0.82rem]">
                          {describeCadence(r)}
                          {r.autoPost ? ', recorded for you' : ', you tick it off'}
                          {accounts.get(r.accountId)?.role === 'savings' ? ', from savings' : ''}
                        </span>
                      </span>
                      <span class="text-right">
                        <Money
                          value={r.kind === 'income' ? r.amount : -r.amount}
                          code={code}
                          sign={r.kind === 'income' ? 'always' : 'auto'}
                          tone={r.kind === 'income' ? 'income' : 'none'}
                          class="text-[1.1rem]"
                        />
                        {r.unit !== 'month' && (
                          <span class="text-subtle block text-xs">
                            {formatMoney(monthlyEquivalent(r), code)} a month
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
            </div>
          ) : (
            <Empty
              title="Nothing repeats yet."
              body="Add rent, phone, subscriptions and regular income. They show up before they are due, and safe-to-spend keeps them aside."
            />
          )}
          {suggestions.length > 0 && (
            <div class="border-gold mt-8 border-l-2 pl-4">
              <p class="caps text-gold-ink">Spotted in your history</p>
              {suggestions.slice(0, 4).map((sg) => (
                <div key={sg.key} class="border-line flex items-baseline gap-3 border-b py-2.5">
                  <Swatch category={sg.categoryId ? cats.get(sg.categoryId) : null} />
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-bold">{sg.payee}</div>
                    <div class="text-subtle text-[0.82rem]">
                      {formatMoney(sg.amount, accounts.get(sg.accountId)?.currency ?? base)}{' '}
                      {sg.unit === 'month' ? 'monthly' : sg.unit === 'week' ? 'weekly' : 'yearly'},
                      seen {plural(sg.count, 'time')}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="link text-sm"
                    onClick={() => {
                      apply(
                        addRecurring({
                          name: sg.payee,
                          kind: 'expense',
                          amount: sg.amount,
                          accountId: sg.accountId,
                          categoryId: sg.categoryId,
                          every: 1,
                          unit: sg.unit,
                          startOn: sg.last,
                          autoPost: false,
                          lastPostedOn: sg.last,
                        }),
                        'Track',
                      );
                      toast({
                        message: `${sg.payee} is on the list now. You'll see it coming.`,
                        tone: 'good',
                        action: { label: 'Undo', run: () => undo() },
                      });
                    }}
                  >
                    Keep track
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <section
          class="animate-rise self-start"
          aria-labelledby="next-title"
          style={{ animationDelay: '160ms' }}
        >
          <SectionTitle id="next-title" title="The next 30 days" />
          {soon.length ? (
            soon.slice(0, 8).map((u) => (
              <div key={u.recurring.id + u.date} class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                  <UpcomingRow
                    u={u}
                    cat={u.recurring.categoryId ? cats.get(u.recurring.categoryId) : undefined}
                    code={accounts.get(u.recurring.accountId)?.currency ?? base}
                    today={today}
                  />
                </div>
                {!u.recurring.autoPost && u.date <= today && (
                  <button
                    type="button"
                    class="link text-sm"
                    onClick={() => (
                      apply(payRecurring(data, u.recurring.id, u.date), 'Pay'),
                      toast({
                        message: `Ticked off: ${u.recurring.name}`,
                        tone: 'good',
                        action: { label: 'Undo', run: () => undo() },
                      })
                    )}
                  >
                    Paid
                  </button>
                )}
              </div>
            ))
          ) : (
            <p class="text-muted mt-4">Nothing due. A quiet month ahead.</p>
          )}
        </section>
      </div>

      <SalarySheet
        open={salaryOpen}
        onClose={() => setSalaryOpen(false)}
        salary={s}
        today={today}
      />
      <BudgetSheet categoryId={budgetFor} onClose={() => setBudgetFor(null)} today={today} />
      <RecurringSheet item={recurring} onClose={() => setRecurring(null)} today={today} />
    </div>
  );
}

function SalarySheet({
  open,
  onClose,
  salary,
  today,
}: {
  open: boolean;
  onClose: () => void;
  salary: Salary | null;
  today: string;
}) {
  const { data } = useLedger();
  const base = data.settings.base;
  const savings = savingsAccounts(data);
  const spending = spendingAccounts(data);
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [auto, setAuto] = useState(true);
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setAmount(toInput(salary?.amount, base));
    setDay(data.settings.cycleDay);
    setFrom(salary?.fromAccountId ?? savings[0]?.id ?? '');
    setTo(salary?.toAccountId ?? spending[0]?.id ?? '');
    setAuto(salary?.autoPost ?? true);
    setActive(salary?.active ?? true);
  }, [open]);
  const value = fromInput(amount, base);
  const ok = !!value && !!from && !!to && from !== to;
  const save = () => {
    if (!ok) return;
    const changedDay = day !== data.settings.cycleDay;
    apply(setSettings({ cycleDay: day }), 'Salary');
    apply(
      setSalary({
        active,
        amount: value!,
        fromAccountId: from,
        toAccountId: to,
        autoPost: auto,
        startedOn: salary?.startedOn ?? today,
        lastPostedOn: salary && !changedDay ? salary.lastPostedOn : cycleOf(today, day).start,
      }),
    );
    onClose();
    toast({
      message: active ? `Salary set to ${formatMoney(value!, base)} a month` : 'Salary paused',
      tone: 'good',
    });
  };
  const accountsMissing = data.accounts.length < 2;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your monthly salary"
      description="Moved from savings to spending on payday. This month counts as paid when you first set it."
      footer={
        <>
          <button type="button" class="btn btn-ghost mr-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" disabled={!ok} onClick={save}>
            <Icon name="check" size={18} /> Save
          </button>
        </>
      }
    >
      {accountsMissing ? (
        <p class="text-muted">
          A salary moves money between two accounts: add a savings account and a spending account in{' '}
          <a class="link" href={url('settings/#accounts')}>
            Settings
          </a>{' '}
          first.
        </p>
      ) : (
        <div class="grid gap-5">
          <Field id="sal-amount" label="Amount each month">
            <AmountInput id="sal-amount" value={amount} onInput={setAmount} code={base} big />
          </Field>
          <Field
            id="sal-day"
            label="Payday"
            hint="Your money month runs from this day to the day before the next payday."
          >
            <select
              id="sal-day"
              class="select"
              value={day}
              onChange={(e) => setDay(Number((e.target as HTMLSelectElement).value))}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  The {ordinal(d)} of each month
                </option>
              ))}
            </select>
          </Field>
          <div class="grid gap-4 sm:grid-cols-2">
            <Field id="sal-from" label="From">
              <select
                id="sal-from"
                class="select"
                value={from}
                onChange={(e) => setFrom((e.target as HTMLSelectElement).value)}
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="sal-to" label="To">
              <select
                id="sal-to"
                class="select"
                value={to}
                onChange={(e) => setTo((e.target as HTMLSelectElement).value)}
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Switch
            checked={auto}
            onChange={setAuto}
            label="Move it automatically"
            hint="Ledger records the transfer on payday. Turn off if you move it yourself and import the statement."
          />
          {salary && (
            <Switch
              checked={active}
              onChange={setActive}
              label="Salary is on"
              hint="Pause it without losing the settings."
            />
          )}
        </div>
      )}
    </Sheet>
  );
}

function BudgetSheet({
  categoryId,
  onClose,
  today,
}: {
  categoryId: string | null;
  onClose: () => void;
  today: string;
}) {
  const { data } = useLedger();
  const base = data.settings.base;
  const open = categoryId !== null;
  const existing = categoryId ? data.budgets.find((b) => b.categoryId === categoryId) : undefined;
  const [cat, setCat] = useState('');
  const [amount, setAmount] = useState('');
  const [rollover, setRollover] = useState(false);
  useEffect(() => {
    if (categoryId === null) return;
    const first = data.categories.find(
      (c) =>
        c.kind === 'expense' && !c.archived && !data.budgets.some((b) => b.categoryId === c.id),
    );
    const id = categoryId || first?.id || '';
    setCat(id);
    setAmount(toInput(existing?.amount ?? (suggestBudget(data, id, today) || undefined), base));
    setRollover(existing?.rollover ?? false);
  }, [categoryId]);
  const suggestion = cat ? suggestBudget(data, cat, today) : 0;
  const value = fromInput(amount, base);
  const options = data.categories.filter(
    (c) =>
      c.kind === 'expense' &&
      !c.archived &&
      (c.id === categoryId || !data.budgets.some((b) => b.categoryId === c.id)),
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit budget' : 'Add a budget'}
      footer={
        <>
          {existing && (
            <button
              type="button"
              class="btn btn-danger mr-auto"
              onClick={() => {
                apply(removeBudget(existing.categoryId), 'Remove budget');
                onClose();
                toast({ message: 'Budget removed', action: { label: 'Undo', run: () => undo() } });
              }}
            >
              <Icon name="trash" size={17} /> Remove
            </button>
          )}
          <button
            type="button"
            class="btn btn-primary"
            disabled={!value || !cat}
            onClick={() => {
              apply(setBudget(cat, value!, rollover, today), 'Budget');
              onClose();
              toast({ message: 'Budget saved', tone: 'good' });
            }}
          >
            <Icon name="check" size={18} /> Save
          </button>
        </>
      }
    >
      <div class="grid gap-5">
        <Field id="bud-cat" label="Category">
          <select
            id="bud-cat"
            class="select"
            value={cat}
            disabled={!!existing}
            onChange={(e) => (
              setCat((e.target as HTMLSelectElement).value),
              setAmount(
                toInput(
                  suggestBudget(data, (e.target as HTMLSelectElement).value, today) || undefined,
                  base,
                ),
              )
            )}
          >
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="bud-amount"
          label="Each month"
          hint={
            suggestion
              ? `Your last three months averaged about ${formatMoney(suggestion, base)}.`
              : undefined
          }
        >
          <AmountInput id="bud-amount" value={amount} onInput={setAmount} code={base} big />
        </Field>
        <Switch
          checked={rollover}
          onChange={setRollover}
          label="Roll over what is left"
          hint="Unspent money carries into next month; overspending comes out of it."
        />
      </div>
    </Sheet>
  );
}

function RecurringSheet({
  item,
  onClose,
  today,
}: {
  item: Recurring | 'new' | null;
  onClose: () => void;
  today: string;
}) {
  const { data } = useLedger();
  const open = item !== null;
  const editing = item && item !== 'new' ? item : null;
  const [f, setF] = useState({
    name: '',
    kind: 'expense' as 'expense' | 'income',
    amount: '',
    accountId: '',
    categoryId: '',
    every: 1,
    unit: 'month' as Unit,
    startOn: today,
    endOn: '',
    autoPost: true,
  });
  const id = editing?.id ?? (open ? 'new' : null);
  useEffect(() => {
    if (id === null) return;
    const spend = spendingAccounts(data)[0] ?? data.accounts[0];
    setF(
      editing
        ? {
            name: editing.name,
            kind: editing.kind,
            amount: toInput(
              editing.amount,
              accountMap(data).get(editing.accountId)?.currency ?? data.settings.base,
            ),
            accountId: editing.accountId,
            categoryId: editing.categoryId ?? '',
            every: editing.every,
            unit: editing.unit,
            startOn: editing.startOn,
            endOn: editing.endOn ?? '',
            autoPost: editing.autoPost,
          }
        : {
            name: '',
            kind: 'expense',
            amount: '',
            accountId: spend?.id ?? '',
            categoryId: 'subscriptions',
            every: 1,
            unit: 'month',
            startOn: today,
            endOn: '',
            autoPost: true,
          },
    );
  }, [id]);
  const code = accountMap(data).get(f.accountId)?.currency ?? data.settings.base;
  const value = fromInput(f.amount, code);
  const ok = !!value && !!f.name.trim() && !!f.accountId;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!ok) return;
    const payload = {
      name: f.name.trim(),
      kind: f.kind,
      amount: value!,
      accountId: f.accountId,
      categoryId: f.categoryId || undefined,
      every: Math.max(1, f.every),
      unit: f.unit,
      startOn: f.startOn,
      endOn: f.endOn || undefined,
      autoPost: f.autoPost,
    };
    if (editing) apply(updateRecurring(editing.id, payload), 'Edit recurring');
    // A new automatic item starting in the past would post everything since then; start from the next date instead.
    else
      apply(
        addRecurring({
          ...payload,
          lastPostedOn: f.startOn < today ? addDays(today, -1) : undefined,
        }),
        'Add recurring',
      );
    onClose();
    toast({
      message: editing ? 'Saved' : `Added ${payload.name}`,
      tone: 'good',
      action: { label: 'Undo', run: () => undo() },
    });
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit recurring' : 'Add recurring'}
      footer={
        <>
          {editing && (
            <button
              type="button"
              class="btn btn-danger mr-auto"
              onClick={() => {
                apply(removeRecurring(editing.id), 'Remove recurring');
                onClose();
                toast({
                  message: `Removed ${editing.name}`,
                  action: { label: 'Undo', run: () => undo() },
                });
              }}
            >
              <Icon name="trash" size={17} /> Remove
            </button>
          )}
          <button type="button" class="btn btn-primary" disabled={!ok} onClick={save}>
            <Icon name="check" size={18} /> Save
          </button>
        </>
      }
    >
      <div class="grid gap-5">
        <div class="seg w-full" role="radiogroup" aria-label="Type">
          {(['expense', 'income'] as const).map((k) => (
            <button
              type="button"
              role="radio"
              key={k}
              aria-checked={f.kind === k}
              onClick={() =>
                set({ kind: k, categoryId: k === 'income' ? 'salary' : 'subscriptions' })
              }
            >
              {k === 'expense' ? 'A cost' : 'Income'}
            </button>
          ))}
        </div>
        <Field id="rec-name" label="Name">
          <input
            id="rec-name"
            class="input"
            value={f.name}
            placeholder={
              f.kind === 'expense' ? 'Phone, gym, streaming…' : 'Part-time job, allowance…'
            }
            onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
          />
        </Field>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field id="rec-amount" label="Amount">
            <AmountInput
              id="rec-amount"
              value={f.amount}
              onInput={(amount) => set({ amount })}
              code={code}
            />
          </Field>
          <Field id="rec-every" label="Repeats">
            <div class="grid grid-cols-[4.5rem_1fr] gap-2">
              <input
                id="rec-every"
                type="number"
                min={1}
                max={52}
                class="input"
                aria-label="Every"
                value={f.every}
                onInput={(e) => set({ every: Number((e.target as HTMLInputElement).value) || 1 })}
              />
              <select
                class="select"
                aria-label="Unit"
                value={f.unit}
                onChange={(e) => set({ unit: (e.target as HTMLSelectElement).value as Unit })}
              >
                <option value="week">{f.every === 1 ? 'week' : 'weeks'}</option>
                <option value="month">{f.every === 1 ? 'month' : 'months'}</option>
                <option value="year">{f.every === 1 ? 'year' : 'years'}</option>
              </select>
            </div>
          </Field>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field
            id="rec-account"
            label={f.kind === 'expense' ? 'Paid from' : 'Paid into'}
            hint={
              accountMap(data).get(f.accountId)?.role === 'savings'
                ? 'From savings: it shows in your runway.'
                : undefined
            }
          >
            <select
              id="rec-account"
              class="select"
              value={f.accountId}
              onChange={(e) => set({ accountId: (e.target as HTMLSelectElement).value })}
            >
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({currency(a.currency).label})
                </option>
              ))}
            </select>
          </Field>
          <Field id="rec-cat" label="Category">
            <select
              id="rec-cat"
              class="select"
              value={f.categoryId}
              onChange={(e) => set({ categoryId: (e.target as HTMLSelectElement).value })}
            >
              <option value="">None</option>
              {data.categories
                .filter((c) => c.kind === f.kind && !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field id="rec-start" label={editing ? 'First date' : 'Next date'}>
            <input
              id="rec-start"
              type="date"
              class="input"
              value={f.startOn}
              onInput={(e) => set({ startOn: (e.target as HTMLInputElement).value })}
            />
          </Field>
          <Field id="rec-end" label="Ends (optional)">
            <input
              id="rec-end"
              type="date"
              class="input"
              value={f.endOn}
              min={f.startOn}
              onInput={(e) => set({ endOn: (e.target as HTMLInputElement).value })}
            />
          </Field>
        </div>
        <Switch
          checked={f.autoPost}
          onChange={(autoPost) => set({ autoPost })}
          label="Record it automatically"
          hint="Adds the transaction on each date. Turn off to tick it off yourself."
        />
      </div>
    </Sheet>
  );
}
