import { useEffect, useMemo, useState } from 'preact/hooks';
import { openTxn, toast, type TxnPrefill } from '@/lib/bus';
import { formatMoney } from '@/lib/money/money';
import { convert } from '@/lib/money/fx';
import { CURRENCIES, currency } from '@/lib/money/currency';
import type { LedgerData, Txn, TxnKind } from '@/lib/model';
import { rateFor } from '@/lib/ledger';
import { parseQuickAdd } from '@/lib/quick-add';
import { addAccount, addTxn, deleteTxns, learnRule, updateTxn } from '@/lib/store/ops';
import { apply, undo } from '@/lib/store/store';
import { uid } from '@/lib/ids';
import { AmountInput, CategoryPicker, Field, Segmented, fromInput, toInput } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';

interface Props {
  data: LedgerData;
  today: string;
}

interface Form {
  kind: TxnKind;
  amount: string;
  accountId: string;
  toAccountId: string;
  categoryId?: string;
  payee: string;
  date: string;
  note: string;
  foreign: boolean;
  origAmount: string;
  origCurrency: string;
}

function blank(data: LedgerData, today: string, p: TxnPrefill = {}): Form {
  const spend =
    data.accounts.find((a) => a.role === 'spending' && !a.archived) ??
    data.accounts.find((a) => !a.archived);
  const accountId = p.accountId ?? spend?.id ?? '';
  const cur = data.accounts.find((a) => a.id === accountId)?.currency ?? data.settings.base;
  const other = data.accounts.find((a) => a.id !== accountId && !a.archived);
  return {
    kind: p.kind ?? 'expense',
    amount: toInput(p.amount, cur),
    accountId,
    toAccountId: other?.id ?? '',
    categoryId: p.categoryId,
    payee: p.payee ?? '',
    date: p.date ?? today,
    note: '',
    foreign: false,
    origAmount: '',
    origCurrency: 'USD',
  };
}

function fromTxn(data: LedgerData, t: Txn): Form {
  const cur = data.accounts.find((a) => a.id === t.accountId)?.currency ?? data.settings.base;
  return {
    kind: t.kind,
    amount: toInput(t.amount, cur),
    accountId: t.accountId,
    toAccountId: t.toAccountId ?? '',
    categoryId: t.categoryId,
    payee: t.payee,
    date: t.date,
    note: t.note ?? '',
    foreign: !!t.original,
    origAmount: t.original ? toInput(t.original.amount, t.original.currency) : '',
    origCurrency: t.original?.currency ?? 'USD',
  };
}

export function TxnSheet({ data, today }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [form, setForm] = useState<Form>(() => blank(data, today));
  const [quick, setQuick] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      const { id, prefill } =
        (e as CustomEvent<{ id?: string; prefill?: TxnPrefill }>).detail ?? {};
      const t = id ? data.txns.find((x) => x.id === id) : undefined;
      setEditing(t ?? null);
      setForm(t ? fromTxn(data, t) : blank(data, today, prefill));
      setQuick('');
      setTried(false);
      setOpen(true);
    };
    window.addEventListener('ledger:txn', on);
    return () => window.removeEventListener('ledger:txn', on);
  }, [data, today]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const accounts = data.accounts.filter((a) => !a.archived || a.id === form.accountId);
  const account = data.accounts.find((a) => a.id === form.accountId);
  const code = account?.currency ?? data.settings.base;
  const amount = fromInput(form.amount, code);
  const cats = data.categories.filter(
    (c) => c.kind === (form.kind === 'income' ? 'income' : 'expense') && !c.archived,
  );

  const payees = useMemo(() => {
    const count = new Map<string, { n: number; categoryId?: string }>();
    for (const t of data.txns) {
      if (!t.payee || t.kind === 'transfer') continue;
      const c = count.get(t.payee) ?? { n: 0, categoryId: t.categoryId };
      c.n++;
      count.set(t.payee, c);
    }
    return [...count].sort((a, b) => b[1].n - a[1].n).slice(0, 60);
  }, [data.txns]);

  const applyQuick = (text: string) => {
    setQuick(text);
    const q = parseQuickAdd(text, data, today);
    if (!q) return;
    const patch: Partial<Form> = {
      kind: q.kind,
      payee: q.payee,
      date: q.date,
      categoryId: q.categoryId,
    };
    if (q.currency && q.currency !== code) {
      patch.foreign = true;
      patch.origCurrency = q.currency;
      patch.origAmount = toInput(q.amount, q.currency);
      const rate = rateFor(data, q.currency);
      const inAcct =
        rate && code === data.settings.base ? convert(q.amount, q.currency, code, rate) : null;
      patch.amount = inAcct ? toInput(inAcct, code) : '';
    } else {
      patch.amount = toInput(q.amount, code);
      patch.foreign = false;
    }
    set(patch);
  };

  const onPayee = (payee: string) => {
    const known = payees.find(([p]) => p.toLowerCase() === payee.toLowerCase());
    set({
      payee,
      ...(known && !form.categoryId && known[1].categoryId
        ? { categoryId: known[1].categoryId }
        : {}),
    });
  };

  const onOrig = (text: string, cur = form.origCurrency) => {
    const patch: Partial<Form> = { origAmount: text, origCurrency: cur };
    const v = fromInput(text, cur);
    const rate = rateFor(data, cur);
    if (v && rate && code === data.settings.base) {
      const c = convert(v, cur, code, rate);
      if (c) patch.amount = toInput(c, code);
    }
    set(patch);
  };

  const problems: string[] = [];
  if (!amount) problems.push('Enter an amount.');
  if (form.kind === 'transfer' && (!form.toAccountId || form.toAccountId === form.accountId))
    problems.push('Choose a different account to move the money to.');
  if (form.kind === 'transfer' && accounts.length < 2)
    problems.push('Transfers need two accounts. Add another in Settings.');

  const save = (another = false) => {
    setTried(true);
    if (problems.length) return;
    let accountId = form.accountId;
    if (!accountId) {
      accountId = uid('a');
      apply(
        addAccount({
          id: accountId,
          name: 'Current account',
          role: 'spending',
          currency: data.settings.base,
          opening: 0,
          openedOn: today,
        }),
      );
    }
    const orig = form.foreign ? fromInput(form.origAmount, form.origCurrency) : null;
    const input = {
      date: form.date || today,
      kind: form.kind,
      accountId,
      amount: amount!,
      payee:
        form.payee.trim() ||
        (form.kind === 'transfer'
          ? 'Transfer'
          : (cats.find((c) => c.id === form.categoryId)?.name ?? 'Untitled')),
      note: form.note.trim() || undefined,
      categoryId: form.kind === 'transfer' ? undefined : form.categoryId,
      toAccountId: form.kind === 'transfer' ? form.toAccountId : undefined,
      original: orig ? { amount: orig, currency: form.origCurrency } : undefined,
    };
    if (editing) {
      const changedCategory = editing.categoryId !== input.categoryId && input.categoryId;
      apply(updateTxn(editing.id, { ...input, source: editing.source }), 'Edit');
      toast({ message: 'Saved', tone: 'good', action: { label: 'Undo', run: () => undo() } });
      if (changedCategory && editing.source === 'import') {
        const raw = editing.note ?? editing.payee;
        const learned = learnRule(data, raw, input.categoryId!, input.payee);
        if (learned.others > 0) {
          const name =
            data.categories.find((c) => c.id === input.categoryId)?.name ?? 'this category';
          setTimeout(
            () =>
              toast({
                message: `Put ${learned.others} more from ${input.payee} in ${name}, now and in future imports?`,
                action: {
                  label: 'Yes',
                  run: () =>
                    apply(learnRule(data, raw, input.categoryId!, input.payee).op, 'Learn rule'),
                },
                ms: 9000,
              }),
            350,
          );
        }
      }
    } else {
      apply(addTxn({ ...input, source: 'manual' }), 'Add');
      toast({
        message: `Added ${formatMoney(amount!, code)}${input.payee ? ` · ${input.payee}` : ''}`,
        tone: 'good',
        action: { label: 'Undo', run: () => undo() },
      });
    }
    if (another) {
      setForm({
        ...blank(data, today, { accountId: form.accountId, kind: form.kind, date: form.date }),
      });
      setQuick('');
      setTried(false);
      (document.getElementById('quick-add') ?? document.getElementById('txn-amount'))?.focus();
    } else setOpen(false);
  };

  const remove = () => {
    if (!editing) return;
    apply(deleteTxns([editing.id]), 'Delete');
    setOpen(false);
    toast({
      message: `Deleted ${editing.payee || 'transaction'}`,
      action: { label: 'Undo', run: () => undo() },
    });
  };

  const parsed = quick ? parseQuickAdd(quick, data, today) : null;

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title={editing ? 'Edit transaction' : 'Add a transaction'}
      footer={
        <>
          {editing ? (
            <button type="button" class="btn btn-danger mr-auto" onClick={remove}>
              <Icon name="trash" size={18} /> Delete
            </button>
          ) : (
            <button type="button" class="btn btn-ghost mr-auto" onClick={() => save(true)}>
              Save and add another
            </button>
          )}
          <button type="button" class="btn btn-primary" onClick={() => save()}>
            <Icon name="check" size={18} /> Save
          </button>
        </>
      }
    >
      <form
        class="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {!editing && (
          <div class="field">
            <label class="label" for="quick-add">
              Type it in one line
            </label>
            <div class="relative">
              <Icon
                name="zap"
                size={18}
                class="text-gold-ink pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
              />
              <input
                id="quick-add"
                data-autofocus
                class="input pl-10"
                placeholder="3.750 talabat yesterday"
                value={quick}
                autoComplete="off"
                onInput={(e) => applyQuick((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (parsed) save();
                  }
                }}
              />
            </div>
            <div class="hint" aria-live="polite">
              {parsed
                ? `${parsed.kind === 'income' ? 'Money in' : 'Spent'} ${formatMoney(parsed.amount, parsed.currency ?? code)}${parsed.payee ? ` at ${parsed.payee}` : ''}${parsed.categoryId ? ` · ${cats.find((c) => c.id === parsed.categoryId)?.name ?? ''}` : ''}. Press Enter to save.`
                : 'An amount and a few words. Add + for money in, or a day like yesterday or fri.'}
            </div>
          </div>
        )}

        <Segmented
          label="Type"
          value={form.kind}
          onChange={(kind) =>
            set({ kind, categoryId: kind === form.kind ? form.categoryId : undefined })
          }
          options={[
            { value: 'expense', label: 'Spent' },
            { value: 'income', label: 'Money in' },
            { value: 'transfer', label: 'Transfer' },
          ]}
          class="w-full"
        />

        <Field
          id="txn-amount"
          label={
            form.kind === 'transfer'
              ? 'Amount moved'
              : form.foreign
                ? `Charged to the account (${currency(code).label})`
                : 'Amount'
          }
        >
          <AmountInput
            id="txn-amount"
            value={form.amount}
            onInput={(amount) => set({ amount })}
            code={code}
            big
            invalid={tried && !amount}
          />
        </Field>

        {form.kind !== 'transfer' && (
          <div class="grid gap-3">
            <label class="text-muted flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                class="size-4 accent-[var(--gold)]"
                checked={form.foreign}
                onChange={(e) => set({ foreign: (e.target as HTMLInputElement).checked })}
              />
              Paid in another currency
            </label>
            {form.foreign && (
              <div class="grid grid-cols-[1fr_8rem] gap-2">
                <AmountInput
                  id="txn-orig"
                  label="Amount in the other currency"
                  value={form.origAmount}
                  onInput={(t) => onOrig(t)}
                  code={form.origCurrency}
                />
                <select
                  class="select"
                  aria-label="Currency"
                  value={form.origCurrency}
                  onChange={(e) => onOrig(form.origAmount, (e.target as HTMLSelectElement).value)}
                >
                  {CURRENCIES.filter((c) => c.code !== code).map((c) => (
                    <option value={c.code} key={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                {!rateFor(data, form.origCurrency) && (
                  <p class="hint col-span-2">
                    No rate for {form.origCurrency} yet: type what your bank charged above, or add a
                    rate in Settings.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {form.kind !== 'transfer' && (
          <Field id="txn-payee" label={form.kind === 'income' ? 'From' : 'Where'}>
            <input
              id="txn-payee"
              class="input"
              list="payee-list"
              placeholder={
                form.kind === 'income' ? 'Client, employer, refund…' : 'Shop, place, person…'
              }
              value={form.payee}
              autoComplete="off"
              onInput={(e) => onPayee((e.target as HTMLInputElement).value)}
            />
            <datalist id="payee-list">
              {payees.map(([p]) => (
                <option value={p} key={p} />
              ))}
            </datalist>
          </Field>
        )}

        {form.kind !== 'transfer' && (
          <CategoryPicker
            categories={cats}
            value={form.categoryId}
            onChange={(categoryId) => set({ categoryId })}
            name="txn-category"
          />
        )}

        <div class="grid gap-4 sm:grid-cols-2">
          <Field id="txn-account" label={form.kind === 'transfer' ? 'From account' : 'Account'}>
            {accounts.length ? (
              <select
                id="txn-account"
                class="select"
                value={form.accountId}
                onChange={(e) => set({ accountId: (e.target as HTMLSelectElement).value })}
              >
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name} ({currency(a.currency).label})
                  </option>
                ))}
              </select>
            ) : (
              <div class="input text-muted flex items-center text-sm" id="txn-account">
                A “Current account” is created for you
              </div>
            )}
          </Field>
          {form.kind === 'transfer' ? (
            <Field id="txn-to" label="To account">
              <select
                id="txn-to"
                class="select"
                value={form.toAccountId}
                onChange={(e) => set({ toAccountId: (e.target as HTMLSelectElement).value })}
              >
                <option value="">Choose…</option>
                {accounts
                  .filter((a) => a.id !== form.accountId)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name} ({currency(a.currency).label})
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field id="txn-date" label="Date">
              <input
                id="txn-date"
                type="date"
                class="input"
                value={form.date}
                max="2100-12-31"
                onInput={(e) => set({ date: (e.target as HTMLInputElement).value })}
              />
            </Field>
          )}
        </div>
        {form.kind === 'transfer' && (
          <Field id="txn-date2" label="Date">
            <input
              id="txn-date2"
              type="date"
              class="input"
              value={form.date}
              onInput={(e) => set({ date: (e.target as HTMLInputElement).value })}
            />
          </Field>
        )}

        <Field id="txn-note" label="Note (optional)">
          <input
            id="txn-note"
            class="input"
            value={form.note}
            onInput={(e) => set({ note: (e.target as HTMLInputElement).value })}
          />
        </Field>

        {tried && problems.length > 0 && (
          <div
            class="bg-warn-soft text-warn rounded-md px-4 py-3 text-sm font-semibold"
            role="alert"
          >
            {problems.join(' ')}
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}

export { openTxn };
