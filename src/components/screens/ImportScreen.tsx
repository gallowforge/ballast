import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatLong, formatShort, plural } from '@/lib/dates';
import { formatMinor, formatMoney } from '@/lib/money/money';
import { CURRENCIES, currency } from '@/lib/money/currency';
import { balance } from '@/lib/ledger';
import { ROLE_LABELS, mappingProblems, type Mapping, type Role } from '@/lib/import/detect';
import {
  buildReview,
  hasHistoryBefore,
  mappingFor,
  readStatement,
  sourceFromCSV,
  sourceFromPdf,
  summarize,
  type ReviewRow,
  type Source,
} from '@/lib/import/importer';
import { PdfNoTextError, PdfPasswordError } from '@/lib/import/pdf-text';
import type { AccountRole } from '@/lib/model';
import { uid } from '@/lib/ids';
import { addAccount, applyImport, undoImport } from '@/lib/store/ops';
import { apply, getState } from '@/lib/store/store';
import { toast } from '@/lib/bus';
import { protect } from '@/lib/client';
import { url } from '@/lib/site';
import { CategoryTile, Field, Skeleton } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { useLedger, useToday } from '../ui/hooks';

type Step = 'pick' | 'password' | 'map' | 'review' | 'done';
type View = 'all' | 'new' | 'dups' | 'loose';
const NEW = '__new__';

export default function ImportScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const [step, setStep] = useState<Step>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [password, setPassword] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [accountId, setAccountId] = useState('');
  const [newAcct, setNewAcct] = useState({
    name: '',
    role: 'spending' as AccountRole,
    currency: 'KWD',
  });
  const [invert, setInvert] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [view, setView] = useState<View>('all');
  const [matchOpening, setMatchOpening] = useState(true);
  const [done, setDone] = useState<{
    id: string;
    count: number;
    accountId: string;
    closing?: number;
    to: string;
  } | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [step]);

  const acctCurrency =
    accountId === NEW
      ? newAcct.currency
      : (data.accounts.find((a) => a.id === accountId)?.currency ?? data.settings.base);
  const statement = useMemo(
    () =>
      source && mapping && !mappingProblems(mapping).length
        ? readStatement(source, mapping, acctCurrency, invert)
        : null,
    [source, mapping, acctCurrency, invert],
  );

  const begin = (src: Source) => {
    setSource(src);
    const m = mappingFor(src);
    setMapping(m);
    const match =
      data.accounts.find(
        (a) => !a.archived && a.role === 'spending' && a.currency === src.currency,
      ) ?? data.accounts.find((a) => !a.archived && a.currency === src.currency);
    setAccountId(match?.id ?? NEW);
    setNewAcct({
      name: src.profile.id === 'nbk' ? 'NBK current account' : 'Current account',
      role: data.accounts.some((a) => a.role === 'spending') ? 'other' : 'spending',
      currency: src.currency,
    });
    setInvert(false);
    setStep('map');
  };

  const openFile = async (name: string, bytes: Uint8Array, pass?: string) => {
    setBusy(true);
    setError('');
    try {
      if (/\.pdf$/i.test(name) || (bytes[0] === 0x25 && bytes[1] === 0x50)) {
        const { readPdf } = await import('@/lib/import/pdf-browser');
        const { items } = await readPdf(bytes, pass);
        const src = sourceFromPdf(items, name);
        if (!src)
          throw new Error(
            'No transaction table was found in this PDF. If your bank offers a CSV or Excel export, that works too.',
          );
        setPassword('');
        begin(src);
      } else {
        const text = new TextDecoder('utf-8').decode(bytes);
        const src = sourceFromCSV(text, name);
        if (src.table.length < 2) throw new Error('This file has no rows to import.');
        begin(src);
      }
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setStep('password');
        if (e.reason === 'wrong') setError('That password did not open it. Try again.');
      } else if (e instanceof PdfNoTextError) setError(e.message);
      else setError((e as Error).message || 'This file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024)
      return setError(
        'That file is over 25 MB. A statement should be much smaller: is it the right file?',
      );
    const bytes = new Uint8Array(await f.arrayBuffer());
    setFile({ name: f.name, bytes });
    await openFile(f.name, bytes);
  };

  const sample = async (kind: 'pdf' | 'csv') => {
    const res = await fetch(url(`samples/sample-statement.${kind}`));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const name = `sample-statement.${kind}`;
    setFile({ name, bytes });
    await openFile(name, bytes);
  };

  const toReview = () => {
    if (!statement || !source) return;
    const target = accountId === NEW ? '__pending__' : accountId;
    setRows(buildReview(getState(), target, statement));
    setMatchOpening(
      accountId === NEW ||
        (statement.from ? !hasHistoryBefore(getState(), accountId, statement.from) : false),
    );
    setView('all');
    setStep('review');
  };

  const commit = () => {
    if (!statement || !source || !mapping) return;
    let target = accountId;
    if (accountId === NEW) {
      target = uid('a');
      apply(
        addAccount({
          id: target,
          name: newAcct.name.trim() || 'Imported account',
          role: newAcct.role,
          currency: newAcct.currency,
          opening: 0,
          openedOn: statement.from ?? today,
        }),
      );
    }
    const fixed = rows.map((r) => ({
      ...r,
      fingerprint: r.fingerprint.replace('__pending__', target),
      key: r.key.replace('__pending__', target),
    }));
    const opening =
      matchOpening && statement.reconciliation.opening !== undefined && statement.from
        ? { amount: statement.reconciliation.opening, on: statement.from }
        : undefined;
    const { op, id } = applyImport(fixed, {
      kind: source.kind,
      profile: source.profile.id,
      fileName: source.fileName,
      accountId: target,
      from: statement.from ?? today,
      to: statement.to ?? today,
      closing: statement.reconciliation.closing,
      opening,
    });
    apply(op, 'Import');
    if (!getState().settings.onboarded)
      apply((d) => ({ ...d, settings: { ...d.settings, onboarded: true, demo: false } }));
    void protect();
    setDone({
      id,
      count: fixed.filter((r) => r.include).length,
      accountId: target,
      closing: statement.reconciliation.closing,
      to: statement.to ?? today,
    });
    setStep('done');
    setFile(null);
  };

  const reset = () => {
    setStep('pick');
    setSource(null);
    setMapping(null);
    setRows([]);
    setError('');
    setDone(null);
  };

  if (!ready) return <Skeleton class="h-96 rounded-3xl" />;

  const steps: { id: Step; label: string }[] = [
    { id: 'pick', label: 'Choose' },
    { id: 'map', label: 'Check columns' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' },
  ];
  const stepIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === (step === 'password' ? 'pick' : step)),
  );

  return (
    <div class="grid grid-cols-1 gap-10">
      <ol
        class="animate-rise flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-line pb-3 text-sm font-bold"
        aria-label="Import steps"
      >
        {steps.map((s, i) => (
          <li
            key={s.id}
            class={`flex items-baseline gap-2 ${i === stepIndex ? 'text-fg' : 'text-subtle'}`}
            aria-current={i === stepIndex ? 'step' : undefined}
          >
            <span class={`figure text-[1.35rem] ${i < stepIndex ? 'text-good' : i === stepIndex ? 'text-gold-ink' : ''}`}>
              {i < stepIndex ? <Icon name="check" size={16} stroke={2.6} /> : i + 1}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {(step === 'pick' || step === 'password') && (
        <div class="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section class="card card-pad animate-rise" aria-labelledby="pick-title">
            <h2
              id="pick-title"
              ref={headingRef}
              tabIndex={-1}
              class="serif text-[1.6rem] leading-tight font-[480] outline-none"
            >
              {step === 'password' ? 'This statement is locked' : 'Bring in a bank statement'}
            </h2>
            {step === 'password' ? (
              <form
                class="mt-4 grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (file) void openFile(file.name, file.bytes, password);
                }}
              >
                <p class="text-muted">
                  Banks often protect statement PDFs with a password. It is used once, here on your
                  device, and never saved.
                </p>
                <Field id="pdf-pass" label="Statement password">
                  <input
                    id="pdf-pass"
                    type="password"
                    class="input"
                    autoComplete="off"
                    value={password}
                    onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                    data-autofocus
                  />
                </Field>
                <div class="flex gap-2">
                  <button type="submit" class="btn btn-primary" disabled={!password || busy}>
                    <Icon name="lock" size={17} /> Open
                  </button>
                  <button type="button" class="btn btn-ghost" onClick={reset}>
                    Choose another file
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p class="text-muted mt-1">
                  A PDF or CSV from your bank. National Bank of Kuwait statements are recognised;
                  any bank works through column matching.
                </p>
                <label
                  class={`mt-5 grid cursor-pointer place-items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? 'border-gold bg-gold-soft' : 'border-line-strong hover:border-gold'}`}
                  onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    void choose(e.dataTransfer?.files?.[0]);
                  }}
                >
                  <span class="tile tile-lg">
                    <Icon name={busy ? 'clock' : 'file'} size={24} />
                  </span>
                  <span class="font-bold">
                    {busy ? 'Reading the statement…' : 'Drop a statement here, or choose a file'}
                  </span>
                  <span class="text-subtle text-sm">PDF or CSV, up to 25 MB</span>
                  <input
                    ref={inputRef}
                    type="file"
                    class="sr-only"
                    accept=".pdf,.csv,.txt,application/pdf,text/csv"
                    onChange={(e) => void choose((e.target as HTMLInputElement).files?.[0])}
                  />
                </label>
                <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span class="text-muted">No statement to hand?</span>
                  <button
                    type="button"
                    class="btn btn-soft btn-sm"
                    onClick={() => void sample('pdf')}
                    disabled={busy}
                  >
                    Try a sample PDF
                  </button>
                  <button
                    type="button"
                    class="btn btn-soft btn-sm"
                    onClick={() => void sample('csv')}
                    disabled={busy}
                  >
                    Try a sample CSV
                  </button>
                </div>
              </>
            )}
            {error && (
              <p
                class="bg-warn-soft text-warn mt-4 rounded-2xl px-4 py-3 text-sm font-semibold"
                role="alert"
              >
                {error}
              </p>
            )}
          </section>
          <aside class="animate-rise self-start border-l-2 border-gold pl-5" style={{ animationDelay: '60ms' }}>
            <p class="caps text-gold-ink">Read here, never uploaded</p>
            <ul class="text-muted mt-3 grid gap-3 text-[0.95rem]">
              <li>
                The file is read in this tab. Ledger has no server, and its security policy blocks
                every connection to one.
              </li>
              <li>
                Every row is checked against the statement's running balance, so nothing is misread
                silently.
              </li>
              <li>Import the same statement twice and nothing is added twice.</li>
              <li>Every import can be undone in one tap.</li>
            </ul>
          </aside>
          {data.imports.length > 0 && (
            <section class="lg:col-span-2" aria-labelledby="hist-title">
              <h2 id="hist-title" class="serif border-fg mb-1 border-b-2 pb-2 text-[1.45rem] font-[480]">
                Earlier imports
              </h2>
              <div class="divide">
                {[...data.imports]
                  .sort((a, b) => b.at - a.at)
                  .map((b) => (
                    <div key={b.id} class="flex flex-wrap items-center gap-3 py-3">
                      <div class="min-w-0 flex-1">
                        <div class="truncate font-semibold">{b.fileName}</div>
                        <div class="text-subtle text-sm">
                          {plural(b.count, 'transaction')} · {formatShort(b.from)} to{' '}
                          {formatShort(b.to)} ·{' '}
                          {data.accounts.find((a) => a.id === b.accountId)?.name}
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        onClick={() => {
                          apply(undoImport(b.id), 'Undo import');
                          toast({
                            message: `Removed ${plural(b.count, 'imported transaction')}`,
                            tone: 'good',
                          });
                        }}
                      >
                        <Icon name="undo" size={16} /> Undo
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      )}

      {step === 'map' && source && mapping && (
        <section class="card card-pad animate-rise" aria-labelledby="map-title">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="map-title"
                ref={headingRef}
                tabIndex={-1}
                class="serif text-[1.6rem] leading-tight font-[480] outline-none"
              >
                Check the columns
              </h2>
              <p class="text-muted">
                {source.profile.id === 'nbk'
                  ? 'Recognised as a National Bank of Kuwait statement. '
                  : ''}
                {plural(source.table.length - Math.max(0, mapping.header + 1), 'row')} found in{' '}
                {source.fileName}. The columns below were matched for you: fix any that look wrong.
              </p>
            </div>
            <span class="pill">{source.kind.toUpperCase()}</span>
          </div>

          <div class="mt-5 grid gap-4 md:grid-cols-3">
            <Field id="imp-account" label="Import into">
              <select
                id="imp-account"
                class="select"
                value={accountId}
                onChange={(e) => setAccountId((e.target as HTMLSelectElement).value)}
              >
                {data.accounts
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({currency(a.currency).label})
                    </option>
                  ))}
                <option value={NEW}>A new account…</option>
              </select>
            </Field>
            <Field id="imp-dates" label="Dates are written" hint="Day first is the norm in Kuwait.">
              <select
                id="imp-dates"
                class="select"
                value={mapping.dateOrder}
                onChange={(e) =>
                  setMapping({
                    ...mapping,
                    dateOrder: (e.target as HTMLSelectElement).value as Mapping['dateOrder'],
                  })
                }
              >
                <option value="dmy">Day / month / year</option>
                <option value="mdy">Month / day / year</option>
                <option value="ymd">Year / month / day</option>
              </select>
            </Field>
            {mapping.columns.includes('amount') && !mapping.columns.includes('balance') && (
              <label class="flex items-center gap-3 self-end pb-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  class="size-5 accent-[var(--gold)]"
                  checked={invert}
                  onChange={(e) => setInvert((e.target as HTMLInputElement).checked)}
                />
                Spending is shown as positive
              </label>
            )}
          </div>
          {accountId === NEW && (
            <div class="border-line bg-sunken mt-4 grid gap-4 rounded-2xl border p-4 md:grid-cols-3">
              <Field id="new-name" label="Account name">
                <input
                  id="new-name"
                  class="input"
                  value={newAcct.name}
                  onInput={(e) =>
                    setNewAcct({ ...newAcct, name: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
              <Field id="new-role" label="What it is for">
                <select
                  id="new-role"
                  class="select"
                  value={newAcct.role}
                  onChange={(e) =>
                    setNewAcct({
                      ...newAcct,
                      role: (e.target as HTMLSelectElement).value as AccountRole,
                    })
                  }
                >
                  <option value="spending">Spending (receives the salary)</option>
                  <option value="savings">Savings (counts in the runway)</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field id="new-cur" label="Currency">
                <select
                  id="new-cur"
                  class="select"
                  value={newAcct.currency}
                  onChange={(e) =>
                    setNewAcct({ ...newAcct, currency: (e.target as HTMLSelectElement).value })
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <div class="scroll-x border-line mt-5 rounded-2xl border">
            <table class="w-full min-w-[40rem] text-sm">
              <thead>
                <tr class="bg-sunken">
                  {mapping.columns.map((role, i) => (
                    <th key={i} class="p-2 text-left font-semibold">
                      <label class="sr-only" for={`col-${i}`}>
                        Column {i + 1}
                        {mapping.header >= 0 ? ` (${source.table[mapping.header]![i] ?? ''})` : ''}
                      </label>
                      <select
                        id={`col-${i}`}
                        class={`select min-h-9 py-0 text-sm ${role === 'ignore' ? 'text-subtle' : 'font-bold'}`}
                        value={role}
                        onChange={(e) => {
                          const next = [...mapping.columns];
                          const r = (e.target as HTMLSelectElement).value as Role;
                          if (r !== 'ignore')
                            next.forEach((x, j) => x === r && (next[j] = 'ignore'));
                          next[i] = r;
                          setMapping({ ...mapping, columns: next });
                        }}
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      {mapping.header >= 0 && (
                        <div class="text-subtle mt-1 truncate px-1 text-xs font-normal">
                          {source.table[mapping.header]![i]}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {source.table.slice(mapping.header + 1, mapping.header + 9).map((r, i) => (
                  <tr key={i} class="border-line border-t">
                    {mapping.columns.map((role, j) => (
                      <td
                        key={j}
                        class={`max-w-[16rem] truncate p-2 ${role === 'ignore' ? 'text-subtle' : ''} ${['debit', 'credit', 'amount', 'balance'].includes(role) ? 'text-right tabular-nums' : ''}`}
                      >
                        {r[j] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mappingProblems(mapping).length > 0 && (
            <p
              class="bg-warn-soft text-warn mt-4 rounded-2xl px-4 py-3 text-sm font-semibold"
              role="alert"
            >
              {mappingProblems(mapping).join(' ')}
            </p>
          )}
          {statement && statement.rows.length === 0 && (
            <p
              class="bg-warn-soft text-warn mt-4 rounded-2xl px-4 py-3 text-sm font-semibold"
              role="alert"
            >
              No dated rows with amounts were found with these columns. Check the date column and
              the date format.
            </p>
          )}
          <div class="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" class="btn btn-ghost mr-auto" onClick={reset}>
              <Icon name="chevron-left" size={18} /> Start over
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={!statement || !statement.rows.length}
              onClick={toReview}
            >
              Review {statement ? plural(statement.rows.length, 'transaction') : ''}{' '}
              <Icon name="arrow-right" size={18} />
            </button>
          </div>
        </section>
      )}

      {step === 'review' && statement && source && (
        <Review
          headingRef={headingRef}
          rows={rows}
          setRows={setRows}
          view={view}
          setView={setView}
          statement={statement}
          code={acctCurrency}
          matchOpening={matchOpening}
          setMatchOpening={setMatchOpening}
          back={() => setStep('map')}
          commit={commit}
          accountId={accountId}
        />
      )}

      {step === 'done' && done && (
        <section class="animate-rise max-w-2xl" aria-labelledby="done-title">
          <p class="caps text-good">Done, and checked</p>
          <h2
            id="done-title"
            ref={headingRef}
            tabIndex={-1}
            class="display mt-3 text-[2.6rem] outline-none sm:text-[3.4rem]"
          >
            {plural(done.count, 'transaction')} imported
          </h2>
          {done.closing !== undefined && (
            <BalanceCheck accountId={done.accountId} closing={done.closing} date={done.to} />
          )}
          <div class="mt-8 flex flex-wrap gap-2">
            <a href={url('activity/')} class="btn btn-primary">
              See them in Activity
            </a>
            <button type="button" class="btn btn-soft" onClick={reset}>
              Import another
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                apply(undoImport(done.id), 'Undo import');
                toast({ message: 'Import undone', tone: 'good' });
                reset();
              }}
            >
              <Icon name="undo" size={16} /> Undo this import
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function BalanceCheck({
  accountId,
  closing,
  date,
}: {
  accountId: string;
  closing: number;
  date: string;
}) {
  const { data } = useLedger();
  const acct = data.accounts.find((a) => a.id === accountId);
  if (!acct) return null;
  const mine = balance(data, accountId, date);
  const code = acct.currency;
  return mine === closing ? (
    <p class="text-muted mt-4 max-w-lg">
      <span class="text-good font-bold">Balances match.</span> {acct.name} shows{' '}
      <Money value={mine} code={code} class="text-fg font-bold" /> on {formatLong(date)}, exactly
      what the statement says.
    </p>
  ) : (
    <p class="text-muted mt-4 max-w-lg">
      {acct.name} shows <Money value={mine} code={code} class="text-fg font-bold" /> on{' '}
      {formatLong(date)}; the statement says{' '}
      <Money value={closing} code={code} class="text-fg font-bold" />. The difference,{' '}
      {formatMoney(Math.abs(mine - closing), code)}, is usually history from before this statement:
      adjust the opening balance in Settings.
    </p>
  );
}

function Review({
  headingRef,
  rows,
  setRows,
  view,
  setView,
  statement,
  code,
  matchOpening,
  setMatchOpening,
  back,
  commit,
  accountId,
}: {
  headingRef: preact.RefObject<HTMLHeadingElement>;
  rows: ReviewRow[];
  setRows: (r: ReviewRow[]) => void;
  view: View;
  setView: (v: View) => void;
  statement: NonNullable<ReturnType<typeof readStatement>>;
  code: string;
  matchOpening: boolean;
  setMatchOpening: (v: boolean) => void;
  back: () => void;
  commit: () => void;
  accountId: string;
}) {
  const { data } = useLedger();
  const [limit, setLimit] = useState(150);
  const sum = summarize(rows);
  const rec = statement.reconciliation;
  const exp = currency(code).exp;
  const cats = data.categories.filter((c) => !c.archived);
  const others = data.accounts.filter((a) => a.id !== accountId && !a.archived);
  const patch = (key: string, p: Partial<ReviewRow>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const visible = rows.filter((r) =>
    view === 'new'
      ? r.include
      : view === 'dups'
        ? r.duplicate.exact || r.duplicate.match
        : view === 'loose'
          ? r.include && r.kind !== 'transfer' && !r.categoryId
          : true,
  );

  return (
    <section class="animate-rise grid gap-5" aria-labelledby="review-title">
      <div class="card card-pad">
        <h2 id="review-title" ref={headingRef} tabIndex={-1} class="serif text-[1.6rem] leading-tight font-[480] outline-none">
          Review before importing
        </h2>
        <p class="text-muted">
          {statement.from && statement.to
            ? `${formatLong(statement.from)} to ${formatLong(statement.to)}. `
            : ''}
          Payees are tidied and categories guessed; change anything before you import.
        </p>
        <div
          class={`mt-4 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${rec.checked && !rec.mismatched.length ? 'bg-good-soft text-good' : rec.mismatched.length ? 'bg-warn-soft text-warn' : 'bg-sunken text-muted'}`}
          role="status"
        >
          <Icon
            name={
              rec.checked && !rec.mismatched.length
                ? 'shield'
                : rec.mismatched.length
                  ? 'alert'
                  : 'info'
            }
            size={19}
            class="mt-0.5 flex-none"
          />
          <span>
            {rec.checked && !rec.mismatched.length
              ? `All ${plural(rec.checked, 'row')} match the statement's running balance, to the last ${exp === 3 ? 'fils' : 'cent'}.`
              : rec.mismatched.length
                ? `${plural(rec.mismatched.length, 'row')} do not follow the running balance (line ${rec.mismatched.slice(0, 5).join(', ')}${rec.mismatched.length > 5 ? '…' : ''}). Check the columns, or import anyway.`
                : 'This statement has no running balance, so the rows could not be cross-checked.'}
            {rec.inferred > 0 &&
              ` ${plural(rec.inferred, 'sign was', 'signs were')} worked out from the balance.`}
          </span>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['To import', String(sum.count)],
            ['Money out', formatMoney(sum.out, code)],
            ['Money in', formatMoney(sum.in, code)],
            ['Already here', String(sum.duplicates)],
          ].map(([k, v]) => (
            <div key={k} class="bg-sunken rounded-2xl px-4 py-3">
              <div class="text-subtle text-xs font-semibold">{k}</div>
              <div class="mt-0.5 font-bold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        {rec.opening !== undefined && statement.from && (
          <label class="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              class="mt-0.5 size-5 flex-none accent-[var(--gold)]"
              checked={matchOpening}
              onChange={(e) => setMatchOpening((e.target as HTMLInputElement).checked)}
            />
            <span>
              <span class="font-semibold">
                Start the account at {formatMoney(rec.opening, code)} on{' '}
                {formatShort(statement.from)}
              </span>
              <span class="text-subtle block">
                The statement's opening balance, so your balance in Ledger matches the bank. Leave
                unticked if the account already has older history here.
              </span>
            </span>
          </label>
        )}
      </div>

      <div class="card">
        <div
          class="scroll-x border-line flex gap-2 border-b px-4 py-3"
          role="group"
          aria-label="Show"
        >
          {(
            [
              ['all', `All ${rows.length}`],
              ['new', `To import ${sum.count}`],
              ['loose', `Needs a category ${sum.uncategorised}`],
              ['dups', `Already here ${sum.duplicates}`],
            ] as [View, string][]
          ).map(([v, l]) => (
            <button
              type="button"
              key={v}
              class="chip"
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <ul class="divide">
          {visible.slice(0, limit).map((r) => {
            const cat = r.categoryId
              ? data.categories.find((c) => c.id === r.categoryId)
              : undefined;
            return (
              <li
                key={r.key}
                class={`grid gap-3 px-4 py-3 sm:grid-cols-[auto_6rem_1fr_13rem_8rem] sm:items-center ${r.include ? '' : 'opacity-55'}`}
              >
                <input
                  type="checkbox"
                  class="size-5 accent-[var(--gold)]"
                  checked={r.include}
                  onChange={(e) =>
                    patch(r.key, { include: (e.target as HTMLInputElement).checked })
                  }
                  aria-label={`Import ${r.payee}`}
                />
                <span class="text-subtle text-sm font-semibold">{formatShort(r.date)}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    {r.kind !== 'transfer' && <CategoryTile category={cat} size="sm" />}
                    <input
                      class="input min-h-9 flex-1 py-0 font-semibold"
                      value={r.payee}
                      aria-label="Payee"
                      onInput={(e) => patch(r.key, { payee: (e.target as HTMLInputElement).value })}
                    />
                  </div>
                  <div class="text-subtle mt-1 truncate text-xs" title={r.raw}>
                    {r.duplicate.exact
                      ? 'Imported before'
                      : r.duplicate.match
                        ? `Matches “${r.duplicate.match.payee}” on ${formatShort(r.duplicate.match.date)}`
                        : r.transferHint && r.kind !== 'transfer'
                          ? `Looks like a transfer · ${r.raw}`
                          : r.raw}
                  </div>
                </div>
                {r.kind === 'transfer' ? (
                  <select
                    class="select min-h-9 py-0 text-sm"
                    aria-label={r.amount < 0 ? 'Moved to' : 'Moved from'}
                    value={r.toAccountId ?? ''}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      patch(
                        r.key,
                        v === '__x'
                          ? { kind: r.amount < 0 ? 'expense' : 'income', toAccountId: undefined }
                          : { toAccountId: v || undefined },
                      );
                    }}
                  >
                    <option value="">{r.amount < 0 ? 'Transfer to…' : 'Transfer from…'}</option>
                    {others.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    <option value="__x">Not a transfer</option>
                  </select>
                ) : (
                  <select
                    class="select min-h-9 py-0 text-sm"
                    aria-label="Category"
                    value={r.categoryId ?? ''}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v === '__t')
                        patch(r.key, {
                          kind: 'transfer',
                          categoryId: undefined,
                          toAccountId: others[0]?.id,
                        });
                      else patch(r.key, { categoryId: v || undefined });
                    }}
                  >
                    <option value="">Uncategorised</option>
                    {cats
                      .filter((c) => c.kind === (r.amount < 0 ? 'expense' : 'income'))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    {others.length > 0 && (
                      <option value="__t">A transfer between my accounts</option>
                    )}
                  </select>
                )}
                <span
                  class={`text-right font-bold tabular-nums ${r.amount > 0 ? 'text-good' : ''}`}
                >
                  {formatMinor(r.amount, exp, { sign: r.amount > 0 ? 'always' : 'auto' })}
                </span>
              </li>
            );
          })}
        </ul>
        {visible.length > limit && (
          <div class="border-line border-t p-3 text-center">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onClick={() => setLimit(limit + 300)}
            >
              Show {Math.min(300, visible.length - limit)} more
            </button>
          </div>
        )}
      </div>

      <div class="card sticky bottom-24 flex flex-wrap items-center gap-3 px-4 py-3 lg:bottom-4">
        <button type="button" class="btn btn-ghost" onClick={back}>
          <Icon name="chevron-left" size={18} /> Columns
        </button>
        <span class="text-muted ml-auto text-sm">
          {sum.uncategorised
            ? `${plural(sum.uncategorised, 'row')} without a category: fine, sort them later.`
            : ''}
        </span>
        <button type="button" class="btn btn-primary" disabled={!sum.count} onClick={commit}>
          <Icon name="check" size={18} /> Import {plural(sum.count, 'transaction')}
        </button>
      </div>
    </section>
  );
}
