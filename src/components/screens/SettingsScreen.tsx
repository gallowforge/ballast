import { useEffect, useState } from 'preact/hooks';
import { formatShort, ordinal, plural, today as todayISO } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import { CURRENCIES, currency } from '@/lib/money/currency';
import { isRate } from '@/lib/money/fx';
import { CATEGORY_ICONS } from '@/lib/icons';
import { balances } from '@/lib/ledger';
import { backupFileName, backupJSON, mergeData, parseBackup, transactionsCSV } from '@/lib/backup';
import type { Account, AccountRole, Category, LedgerData } from '@/lib/model';
import { addAccount, addCategory, deleteAccount, deleteCategory, removeRate, removeRule, replaceAll, setRate, setSettings, updateAccount, updateCategory } from '@/lib/store/ops';
import { apply, undo, wipe } from '@/lib/store/store';
import { loadDemo, protect } from '@/lib/client';
import { toast } from '@/lib/bus';
import { SITE, url } from '@/lib/site';
import { AmountInput, CategoryTile, Field, Segmented, Skeleton, fromInput, toInput } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { useLedger, useToday } from '../ui/hooks';
import { getTheme, setTheme, type ThemeChoice } from '../shell/theme';

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function SettingsScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const [theme, setThemeState] = useState<ThemeChoice>('system');
  const [account, setAccount] = useState<Account | 'new' | null>(null);
  const [category, setCategory] = useState<Category | 'new' | null>(null);
  const [restore, setRestore] = useState<{ data: LedgerData; dropped: number } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [install, setInstall] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [rateCode, setRateCode] = useState('USD');
  const [rateValue, setRateValue] = useState('');

  useEffect(() => {
    setThemeState(getTheme());
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => e.usage && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`));
    const on = (e: Event) => {
      e.preventDefault();
      setInstall(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', on);
    if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }), 200);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  if (!ready) return <Skeleton class="h-[40rem] rounded-3xl" />;
  const base = data.settings.base;
  const bal = balances(data);
  const usedCurrencies = [...new Set(data.accounts.map((a) => a.currency).filter((c) => c !== base))];

  const onRestoreFile = async (f: File | undefined | null) => {
    if (!f) return;
    const res = parseBackup(await f.text());
    if (!res.ok) return toast({ message: res.error, tone: 'warn' });
    setRestore({ data: res.data, dropped: res.dropped });
  };

  return (
    <div class="grid grid-cols-1 gap-6">
      <section class="card card-pad animate-rise" aria-labelledby="gen-title" id="general">
        <h2 id="gen-title" class="text-lg font-bold">
          General
        </h2>
        <div class="mt-4 grid gap-5 md:grid-cols-2">
          <Field id="set-name" label="Your first name" hint="Only used to greet you.">
            <input id="set-name" class="input" value={data.settings.name} onChange={(e) => apply(setSettings({ name: (e.target as HTMLInputElement).value.trim().slice(0, 40) }))} />
          </Field>
          <Field id="set-cycle" label="Your month starts on" hint="Your payday. Budgets and the salary follow it.">
            <select id="set-cycle" class="select" value={data.settings.cycleDay} onChange={(e) => apply(setSettings({ cycleDay: Number((e.target as HTMLSelectElement).value) }), 'Payday')}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  The {ordinal(d)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="set-base" label="Main currency" hint={data.txns.length ? 'Fixed once you have transactions, so every report adds up.' : 'Reports and the runway use it.'}>
            <select id="set-base" class="select" value={base} disabled={data.txns.length > 0} onChange={(e) => apply(setSettings({ base: (e.target as HTMLSelectElement).value }))}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div class="field">
            <span class="label" id="theme-label">
              Appearance
            </span>
            <Segmented
              label="Appearance"
              value={theme}
              onChange={(t) => {
                setTheme(t);
                setThemeState(t);
              }}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </div>
      </section>

      <section class="card card-pad animate-rise" aria-labelledby="acc-title" id="accounts" style={{ animationDelay: '40ms' }}>
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 id="acc-title" class="text-lg font-bold">
              Accounts
            </h2>
            <p class="text-sm text-muted">Savings feed the runway. The spending account receives your salary.</p>
          </div>
          <button type="button" class="btn btn-soft btn-sm" onClick={() => setAccount('new')}>
            <Icon name="plus" size={16} /> Add
          </button>
        </div>
        {data.accounts.length ? (
          <div class="divide">
            {data.accounts.map((a) => (
              <button type="button" key={a.id} class="row-link" onClick={() => setAccount(a)}>
                <span class="tile" style={{ '--tile': a.role === 'savings' ? 'var(--good)' : a.role === 'spending' ? 'var(--gold)' : 'var(--subtle)' }}>
                  <Icon name={a.role === 'savings' ? 'piggy' : 'wallet'} size={19} />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">
                    {a.name} {a.archived && <span class="pill ml-1">Archived</span>}
                  </span>
                  <span class="text-sm text-subtle">
                    {a.role === 'savings' ? 'Savings' : a.role === 'spending' ? 'Spending' : 'Other'} · {currency(a.currency).name}
                  </span>
                </span>
                <Money value={bal.get(a.id) ?? 0} code={a.currency} class="font-bold" />
              </button>
            ))}
          </div>
        ) : (
          <p class="text-sm text-muted">No accounts yet.</p>
        )}
      </section>

      <section class="card card-pad animate-rise" aria-labelledby="rates-title" id="rates" style={{ animationDelay: '80ms' }}>
        <h2 id="rates-title" class="text-lg font-bold">
          Exchange rates
        </h2>
        <p class="text-sm text-muted">Ledger never fetches rates (it makes no network calls). Enter what your bank used; amounts already recorded keep the value they had.</p>
        <div class="mt-4 divide">
          {Object.entries(data.rates).map(([code, r]) => (
            <div key={code} class="flex items-center gap-3 py-2.5">
              <span class="w-12 font-bold">{code}</span>
              <span class="flex-1 text-sm text-muted">
                1 {code} = {r.rate} {currency(base).label} · since {formatShort(r.on)}
              </span>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" aria-label={`Remove the ${code} rate`} onClick={() => apply(removeRate(code), 'Remove rate')}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
        <form
          class="mt-3 grid grid-cols-[7rem_1fr_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isRate(rateValue) || rateCode === base) return;
            apply(setRate(rateCode, rateValue.trim(), todayISO()), 'Rate');
            setRateValue('');
            toast({ message: `Saved: 1 ${rateCode} = ${rateValue.trim()} ${currency(base).label}`, tone: 'good' });
          }}
        >
          <select class="select" aria-label="Currency" value={rateCode} onChange={(e) => setRateCode((e.target as HTMLSelectElement).value)}>
            {CURRENCIES.filter((c) => c.code !== base).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <input class="input" inputMode="decimal" placeholder={`${currency(base).label} per 1 ${rateCode}`} aria-label={`${currency(base).label} per 1 ${rateCode}`} value={rateValue} onInput={(e) => setRateValue((e.target as HTMLInputElement).value)} />
          <button type="submit" class="btn btn-soft" disabled={!isRate(rateValue)}>
            Save
          </button>
        </form>
        {usedCurrencies.some((c) => !data.rates[c]) && <p class="mt-3 text-sm font-semibold text-warn">Add a rate for {usedCurrencies.filter((c) => !data.rates[c]).join(', ')} so those accounts count in your totals.</p>}
      </section>

      <section class="card card-pad animate-rise" aria-labelledby="cat-title" id="categories" style={{ animationDelay: '120ms' }}>
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 id="cat-title" class="text-lg font-bold">
            Categories
          </h2>
          <button type="button" class="btn btn-soft btn-sm" onClick={() => setCategory('new')}>
            <Icon name="plus" size={16} /> Add
          </button>
        </div>
        {(['expense', 'income'] as const).map((k) => (
          <div key={k} class="mt-2">
            <h3 class="eyebrow mb-2">{k === 'expense' ? 'Spending' : 'Money in'}</h3>
            <div class="flex flex-wrap gap-2">
              {data.categories
                .filter((c) => c.kind === k)
                .map((c) => (
                  <button type="button" key={c.id} class="chip gap-2 pl-1.5" onClick={() => setCategory(c)}>
                    <CategoryTile category={c} size="sm" />
                    {c.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </section>

      {data.rules.length > 0 && (
        <section class="card card-pad animate-rise" aria-labelledby="rules-title" id="rules">
          <h2 id="rules-title" class="text-lg font-bold">
            What Ledger has learned
          </h2>
          <p class="text-sm text-muted">When you recategorise an imported transaction, the merchant is remembered for next time.</p>
          <div class="mt-3 divide">
            {data.rules.map((r) => (
              <div key={r.id} class="flex items-center gap-3 py-2.5">
                <span class="flex-1 truncate font-mono text-sm">{r.match}</span>
                <span class="text-sm text-muted">→ {data.categories.find((c) => c.id === r.categoryId)?.name}</span>
                <button type="button" class="btn btn-ghost btn-sm btn-icon" aria-label={`Forget ${r.match}`} onClick={() => apply(removeRule(r.id), 'Forget rule')}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section class="card card-pad animate-rise" aria-labelledby="data-title" id="data" style={{ animationDelay: '160ms' }}>
        <h2 id="data-title" class="text-lg font-bold">
          Your data
        </h2>
        <p class="text-sm text-muted">
          Everything lives in this browser on this device{usage ? ` (${usage})` : ''}.{' '}
          {persisted === true ? 'The browser has agreed to keep it even when space runs low.' : persisted === false ? 'Export a backup now and then: browsers may clear site data when space runs low.' : ''}
        </p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" class="btn btn-soft h-auto flex-col items-start gap-1 rounded-2xl p-4 text-left whitespace-normal" onClick={() => (download(backupFileName(today), backupJSON(data), 'application/json'), toast({ message: 'Backup saved', tone: 'good' }))}>
            <Icon name="download" size={20} class="text-gold-ink" />
            <span class="font-bold">Export a backup</span>
            <span class="text-xs font-medium text-subtle">Everything, as one JSON file</span>
          </button>
          <button type="button" class="btn btn-soft h-auto flex-col items-start gap-1 rounded-2xl p-4 text-left whitespace-normal" onClick={() => download(`ledger-transactions-${today}.csv`, transactionsCSV(data), 'text/csv')} disabled={!data.txns.length}>
            <Icon name="file" size={20} class="text-gold-ink" />
            <span class="font-bold">Export to CSV</span>
            <span class="text-xs font-medium text-subtle">{plural(data.txns.length, 'transaction')}, for spreadsheets</span>
          </button>
          <label class="btn btn-soft h-auto cursor-pointer flex-col items-start gap-1 rounded-2xl p-4 text-left whitespace-normal">
            <Icon name="upload" size={20} class="text-gold-ink" />
            <span class="font-bold">Restore a backup</span>
            <span class="text-xs font-medium text-subtle">From a Ledger JSON file</span>
            <input type="file" accept=".json,application/json" class="sr-only" onChange={(e) => void onRestoreFile((e.target as HTMLInputElement).files?.[0])} />
          </label>
          <button type="button" class="btn btn-danger h-auto flex-col items-start gap-1 rounded-2xl p-4 text-left whitespace-normal" onClick={() => setConfirmWipe(true)}>
            <Icon name="trash" size={20} />
            <span class="font-bold">Delete everything</span>
            <span class="text-xs font-medium">From this device, for good</span>
          </button>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {data.settings.demo ? (
            <span class="text-muted">You are viewing demo data. Delete everything above to start your own.</span>
          ) : !data.txns.length ? (
            <button type="button" class="btn btn-ghost btn-sm" onClick={loadDemo}>
              <Icon name="sparkle" size={16} /> Load demo data
            </button>
          ) : null}
          {persisted === false && (
            <button type="button" class="btn btn-ghost btn-sm" onClick={() => void protect().then(setPersisted)}>
              <Icon name="shield" size={16} /> Ask the browser to keep it
            </button>
          )}
        </div>
      </section>

      <section class="card card-pad animate-rise" aria-labelledby="inst-title" id="install">
        <h2 id="inst-title" class="text-lg font-bold">
          Install Ledger
        </h2>
        <p class="text-sm text-muted">It opens in its own window and works with no connection at all.</p>
        {install ? (
          <button type="button" class="btn btn-gold btn-sm mt-3" onClick={() => void install.prompt().then(() => setInstall(null))}>
            <Icon name="download" size={16} /> Install now
          </button>
        ) : (
          <ul class="mt-3 grid gap-1.5 text-sm text-muted">
            <li>
              <b class="text-fg">iPhone and iPad:</b> in Safari, tap Share, then Add to Home Screen.
            </li>
            <li>
              <b class="text-fg">Android:</b> in Chrome, open the menu and tap Install app.
            </li>
            <li>
              <b class="text-fg">Computer:</b> in Chrome or Edge, click the install icon in the address bar.
            </li>
          </ul>
        )}
        <p class="mt-4 text-xs text-subtle">
          Ledger {SITE.version} ·{' '}
          <a class="link" href={url('privacy/')}>
            Privacy
          </a>{' '}
          ·{' '}
          <a class="link" href={url('about/')}>
            How it works
          </a>{' '}
          ·{' '}
          <a class="link" href={SITE.repo} rel="noopener">
            Source code
          </a>
        </p>
      </section>

      <AccountSheet item={account} onClose={() => setAccount(null)} today={today} />
      <CategorySheet item={category} onClose={() => setCategory(null)} />

      <Sheet
        open={!!restore}
        onClose={() => setRestore(null)}
        title="Restore this backup?"
        description={restore ? `${plural(restore.data.txns.length, 'transaction')}, ${plural(restore.data.accounts.length, 'account')}.${restore.dropped ? ` ${plural(restore.dropped, 'damaged record')} will be skipped.` : ''}` : ''}
        footer={
          <>
            <button type="button" class="btn btn-ghost mr-auto" onClick={() => setRestore(null)}>
              Cancel
            </button>
            {data.txns.length > 0 && (
              <button
                type="button"
                class="btn btn-soft"
                onClick={() => {
                  apply(replaceAll(mergeData(data, restore!.data)), 'Merge backup');
                  setRestore(null);
                  toast({ message: 'Backup merged in', tone: 'good', action: { label: 'Undo', run: () => undo() } });
                }}
              >
                Add to what is here
              </button>
            )}
            <button
              type="button"
              class="btn btn-gold"
              onClick={() => {
                apply(replaceAll({ ...restore!.data, settings: { ...restore!.data.settings, onboarded: true } }), 'Restore backup');
                setRestore(null);
                void protect();
                toast({ message: 'Backup restored', tone: 'good', action: { label: 'Undo', run: () => undo() } });
              }}
            >
              {data.txns.length ? 'Replace everything' : 'Restore'}
            </button>
          </>
        }
      >
        <p class="text-muted">{data.txns.length ? 'Replace swaps your current data for the backup. Add keeps what is here and brings in anything new from the backup.' : 'The backup becomes your data on this device.'}</p>
      </Sheet>

      <Sheet
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Delete everything?"
        description="Every account, transaction, budget and setting on this device. This cannot be undone."
        footer={
          <>
            <button type="button" class="btn btn-ghost mr-auto" onClick={() => setConfirmWipe(false)}>
              Keep my data
            </button>
            <button
              type="button"
              class="btn btn-danger"
              onClick={async () => {
                await wipe();
                setConfirmWipe(false);
                toast({ message: 'Everything was deleted from this device.' });
              }}
            >
              <Icon name="trash" size={17} /> Delete everything
            </button>
          </>
        }
      >
        <p class="text-muted">{data.txns.length && !data.settings.demo ? 'Export a backup first if you might want it back.' : 'Nothing personal is stored yet.'}</p>
      </Sheet>
    </div>
  );
}

function AccountSheet({ item, onClose, today }: { item: Account | 'new' | null; onClose: () => void; today: string }) {
  const { data } = useLedger();
  const editing = item && item !== 'new' ? item : null;
  const [f, setF] = useState({ name: '', role: 'spending' as AccountRole, currency: 'KWD', opening: '', openedOn: today, archived: false });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!item) return;
    setConfirm(false);
    setF(
      editing
        ? { name: editing.name, role: editing.role, currency: editing.currency, opening: toInput(Math.abs(editing.opening), editing.currency), openedOn: editing.openedOn, archived: !!editing.archived }
        : { name: '', role: data.accounts.some((a) => a.role === 'savings') ? 'spending' : 'savings', currency: data.settings.base, opening: '', openedOn: today, archived: false },
    );
  }, [item]);
  const used = editing ? data.txns.filter((t) => t.accountId === editing.id || t.toAccountId === editing.id).length : 0;
  const negative = editing ? editing.opening < 0 : false;
  const save = () => {
    const opening = (fromInput(f.opening, f.currency) ?? 0) * (negative ? -1 : 1);
    const payload = { name: f.name.trim() || 'Account', role: f.role, currency: f.currency, opening, openedOn: f.openedOn, archived: f.archived || undefined };
    if (editing) apply(updateAccount(editing.id, payload), 'Edit account');
    else apply(addAccount(payload), 'Add account');
    onClose();
    toast({ message: editing ? 'Account saved' : `Added ${payload.name}`, tone: 'good', action: { label: 'Undo', run: () => undo() } });
  };
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={editing ? 'Edit account' : 'Add an account'}
      footer={
        <>
          {editing &&
            (confirm ? (
              <button
                type="button"
                class="btn btn-danger mr-auto"
                onClick={() => {
                  apply(deleteAccount(editing.id), 'Delete account');
                  onClose();
                  toast({ message: `Deleted ${editing.name}`, action: { label: 'Undo', run: () => undo() } });
                }}
              >
                Delete it and {plural(used, 'transaction')}
              </button>
            ) : (
              <button type="button" class="btn btn-ghost mr-auto text-bad" onClick={() => setConfirm(true)}>
                <Icon name="trash" size={17} /> Delete
              </button>
            ))}
          <button type="button" class="btn btn-gold" onClick={save}>
            <Icon name="check" size={18} /> Save
          </button>
        </>
      }
    >
      <div class="grid gap-5">
        <Field id="acct-name" label="Name">
          <input id="acct-name" class="input" value={f.name} placeholder="Savings, Current account, Cash…" onInput={(e) => setF({ ...f, name: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field id="acct-role" label="What it is for">
          <select id="acct-role" class="select" value={f.role} onChange={(e) => setF({ ...f, role: (e.target as HTMLSelectElement).value as AccountRole })}>
            <option value="savings">Savings: counts in the runway</option>
            <option value="spending">Spending: receives the salary</option>
            <option value="other">Other: a wallet, cash, a card</option>
          </select>
        </Field>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field id="acct-cur" label="Currency" hint={used ? 'Fixed once it has transactions.' : undefined}>
            <select id="acct-cur" class="select" value={f.currency} disabled={used > 0} onChange={(e) => setF({ ...f, currency: (e.target as HTMLSelectElement).value })}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="acct-date" label="Balance on">
            <input id="acct-date" type="date" class="input" value={f.openedOn} onInput={(e) => setF({ ...f, openedOn: (e.target as HTMLInputElement).value })} />
          </Field>
        </div>
        <Field id="acct-open" label="Starting balance" hint={editing && used ? 'The balance before the first transaction here. Your current balance is this plus everything since.' : 'What is in it today.'}>
          <AmountInput id="acct-open" value={f.opening} onInput={(opening) => setF({ ...f, opening })} code={f.currency} />
        </Field>
        {editing && (
          <label class="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" class="size-5 accent-[var(--gold)]" checked={f.archived} onChange={(e) => setF({ ...f, archived: (e.target as HTMLInputElement).checked })} />
            Archive it (hidden from totals and pickers, history kept)
          </label>
        )}
        {editing && <p class="text-sm text-subtle">Balance now: {formatMoney(balances(data).get(editing.id) ?? 0, editing.currency)}</p>}
      </div>
    </Sheet>
  );
}

function CategorySheet({ item, onClose }: { item: Category | 'new' | null; onClose: () => void }) {
  const { data } = useLedger();
  const editing = item && item !== 'new' ? item : null;
  const [f, setF] = useState({ name: '', kind: 'expense' as 'expense' | 'income', hue: 80, icon: 'dots' });
  const [moveTo, setMoveTo] = useState('');
  useEffect(() => {
    if (!item) return;
    setF(editing ? { name: editing.name, kind: editing.kind, hue: editing.hue, icon: editing.icon } : { name: '', kind: 'expense', hue: 40, icon: 'cookie' });
    setMoveTo('');
  }, [item]);
  const used = editing ? data.txns.filter((t) => t.categoryId === editing.id).length : 0;
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={editing ? 'Edit category' : 'Add a category'}
      footer={
        <>
          {editing && (
            <button
              type="button"
              class="btn btn-ghost mr-auto text-bad"
              onClick={() => {
                apply(deleteCategory(editing.id, moveTo || undefined), 'Delete category');
                onClose();
                toast({ message: `Deleted ${editing.name}`, action: { label: 'Undo', run: () => undo() } });
              }}
            >
              <Icon name="trash" size={17} /> Delete
            </button>
          )}
          <button
            type="button"
            class="btn btn-gold"
            disabled={!f.name.trim()}
            onClick={() => {
              if (editing) apply(updateCategory(editing.id, { ...f, name: f.name.trim() }), 'Edit category');
              else apply(addCategory({ ...f, name: f.name.trim() }), 'Add category');
              onClose();
            }}
          >
            <Icon name="check" size={18} /> Save
          </button>
        </>
      }
    >
      <div class="grid gap-5">
        <div class="flex items-center gap-4">
          <CategoryTile category={{ id: 'x', ...f }} size="lg" />
          <div class="flex-1">
            <Field id="cat-name" label="Name">
              <input id="cat-name" class="input" value={f.name} onInput={(e) => setF({ ...f, name: (e.target as HTMLInputElement).value })} />
            </Field>
          </div>
        </div>
        {!editing && (
          <Segmented
            label="Kind"
            value={f.kind}
            onChange={(kind) => setF({ ...f, kind })}
            options={[
              { value: 'expense', label: 'Spending' },
              { value: 'income', label: 'Money in' },
            ]}
          />
        )}
        <fieldset>
          <legend class="label mb-2">Icon</legend>
          <div class="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
            {CATEGORY_ICONS.map((ic) => (
              <label key={ic} class={`grid aspect-square cursor-pointer place-items-center rounded-xl border ${f.icon === ic ? 'border-gold bg-gold-soft' : 'border-transparent hover:bg-sunken'}`}>
                <input type="radio" name="cat-icon" class="sr-only" checked={f.icon === ic} onChange={() => setF({ ...f, icon: ic })} aria-label={ic} />
                <Icon name={ic} size={18} />
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="cat-hue" label="Colour">
          <input id="cat-hue" type="range" min={0} max={359} value={f.hue} class="w-full" style={{ accentColor: `oklch(68% 0.13 ${f.hue})` }} onInput={(e) => setF({ ...f, hue: Number((e.target as HTMLInputElement).value) })} />
        </Field>
        {editing && used > 0 && (
          <Field id="cat-move" label={`If you delete it, move its ${plural(used, 'transaction')} to`}>
            <select id="cat-move" class="select" value={moveTo} onChange={(e) => setMoveTo((e.target as HTMLSelectElement).value)}>
              <option value="">Leave them uncategorised</option>
              {data.categories
                .filter((c) => c.kind === editing.kind && c.id !== editing.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>
    </Sheet>
  );
}
