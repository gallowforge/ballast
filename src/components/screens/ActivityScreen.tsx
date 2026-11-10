import { useEffect, useMemo, useState } from 'preact/hooks';
import { cycleAt, dayHeading, formatMonth, plural } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import { accountMap, categoryMap, sortedTxns } from '@/lib/ledger';
import type { Txn } from '@/lib/model';
import { categorizeTxns, deleteTxns } from '@/lib/store/ops';
import { apply, undo } from '@/lib/store/store';
import { openTxn, toast } from '@/lib/bus';
import { url } from '@/lib/site';
import { TxnRow } from '../parts/parts';
import { Empty, Skeleton } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';
import { useKey, useLedger, useScrollEdges, useToday } from '../ui/hooks';

type Filter = 'all' | 'spending' | 'income' | 'transfers' | 'uncategorised';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'spending', label: 'Spending' },
  { id: 'income', label: 'Money in' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'uncategorised', label: 'Needs a category' },
];
const LIMIT = 400;

export default function ActivityScreen() {
  const { data, ready } = useLedger();
  const today = useToday();
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [account, setAccount] = useState('all');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filtersRef, filtersMore] = useScrollEdges();

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const f = p.get('filter') as Filter | null;
    if (f && FILTERS.some((x) => x.id === f)) setFilter(f);
    if (p.get('q')) setQuery(p.get('q')!);
    if (p.get('add') === '1') setTimeout(() => openTxn(), 300);
  }, []);

  useKey('/', (e) => {
    e.preventDefault();
    document.getElementById('activity-search')?.focus();
  });

  const cycle = cycleAt(today, data.settings.cycleDay, offset);
  const searching = query.trim().length > 0;
  const cats = useMemo(() => categoryMap(data), [data]);
  const accounts = useMemo(() => accountMap(data), [data]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedTxns(
      data.txns.filter((t) => {
        if (!searching && (t.date < cycle.start || t.date > cycle.end)) return false;
        if (account !== 'all' && t.accountId !== account && t.toAccountId !== account) return false;
        if (filter === 'spending' && t.kind !== 'expense') return false;
        if (filter === 'income' && t.kind !== 'income') return false;
        if (filter === 'transfers' && t.kind !== 'transfer') return false;
        if (filter === 'uncategorised' && (t.kind === 'transfer' || t.categoryId)) return false;
        if (q) {
          const cat = t.categoryId ? (cats.get(t.categoryId)?.name ?? '') : '';
          const hay = `${t.payee} ${t.note ?? ''} ${cat}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    );
  }, [data.txns, query, filter, account, cycle.start, cycle.end, cats]);

  const shown = list.slice(0, LIMIT);
  const groups = useMemo(() => {
    const out: { date: string; items: Txn[]; spent: number }[] = [];
    for (const t of shown) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) {
        g = { date: t.date, items: [], spent: 0 };
        out.push(g);
      }
      g.items.push(t);
      if (t.kind === 'expense') g.spent += t.base;
    }
    return out;
  }, [shown]);

  const base = data.settings.base;
  const spent = list.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.base, 0);
  const earned = list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.base, 0);

  if (!ready)
    return (
      <div class="grid gap-3" aria-busy="true">
        <Skeleton class="h-12 rounded-md" />
        <Skeleton class="h-96 rounded-md" />
      </div>
    );

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulkDelete = () => {
    const n = picked.size;
    apply(deleteTxns([...picked]), 'Delete');
    setPicked(new Set());
    setSelecting(false);
    toast({
      message: `Deleted ${plural(n, 'transaction')}`,
      action: { label: 'Undo', run: () => undo() },
    });
  };
  const bulkCategory = (categoryId: string) => {
    if (!categoryId) return;
    const n = picked.size;
    apply(categorizeTxns([...picked], categoryId), 'Categorise');
    setPicked(new Set());
    setSelecting(false);
    toast({
      message: `Moved ${plural(n, 'transaction')} to ${cats.get(categoryId)?.name}`,
      tone: 'good',
      action: { label: 'Undo', run: () => undo() },
    });
  };

  return (
    <div class="grid grid-cols-1 gap-8">
      <div class="animate-rise grid gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative min-w-[14rem] flex-1">
            <Icon
              name="search"
              size={18}
              class="text-subtle pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
            />
            <input
              id="activity-search"
              class="input pl-10"
              type="search"
              placeholder="Search payees, notes and categories"
              aria-label="Search transactions"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
          {data.accounts.length > 1 && (
            <select
              class="select w-auto min-w-[11rem]"
              aria-label="Account"
              value={account}
              onChange={(e) => setAccount((e.target as HTMLSelectElement).value)}
            >
              <option value="all">All accounts</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {!searching && (
            <div class="flex items-center gap-1" role="group" aria-label="Month">
              <button
                type="button"
                class="btn btn-soft btn-sm btn-icon"
                aria-label="Previous month"
                onClick={() => setOffset(offset - 1)}
              >
                <Icon name="chevron-left" size={18} />
              </button>
              <span class="min-w-[9.5rem] text-center font-bold" aria-live="polite">
                {offset === 0 ? 'This month' : formatMonth(cycle.start)}
              </span>
              <button
                type="button"
                class="btn btn-soft btn-sm btn-icon"
                aria-label="Next month"
                disabled={offset >= 0}
                onClick={() => setOffset(offset + 1)}
              >
                <Icon name="chevron-right" size={18} />
              </button>
            </div>
          )}
        </div>
        <div
          ref={filtersRef}
          class="scroll-x -mx-1 flex gap-2 px-1"
          role="group"
          aria-label="Show"
          data-more={filtersMore}
        >
          {FILTERS.map((f) => (
            <button
              type="button"
              key={f.id}
              class="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            class="chip ml-auto"
            aria-pressed={selecting}
            onClick={() => (setSelecting(!selecting), setPicked(new Set()))}
          >
            <Icon name="check" size={15} /> Select
          </button>
        </div>
        <div class="text-muted flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-live="polite">
          <span>
            Spent <Money value={spent} code={base} class="text-fg font-bold" />
          </span>
          <span>
            Money in <Money value={earned} code={base} class="text-good font-bold" />
          </span>
          <span>{plural(list.length, 'transaction')}</span>
          {searching && <span>across all time</span>}
        </div>
      </div>

      {selecting && picked.size > 0 && (
        <div
          class="bg-raised border-fg animate-pop sticky top-[4.5rem] z-10 flex flex-wrap items-center gap-2 border-y-2 px-1 py-3"
          role="region"
          aria-label="Selected transactions"
        >
          <span class="mr-auto font-bold">{plural(picked.size, 'selected', 'selected')}</span>
          <select
            class="select w-auto"
            aria-label="Set a category for the selected transactions"
            onChange={(e) => bulkCategory((e.target as HTMLSelectElement).value)}
            value=""
          >
            <option value="">Set category…</option>
            {data.categories
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <button type="button" class="btn btn-danger btn-sm" onClick={bulkDelete}>
            <Icon name="trash" size={16} /> Delete
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div>
          {data.txns.length === 0 ? (
            <Empty
              level={2}
              icon="activity"
              title="A clean page."
              body={
                // The + button waits for the first account, so only point at it once it is there.
                data.accounts.length
                  ? 'Nothing written here yet. Add what you spend with the + button (or press N), or bring in a bank statement and the past months fill in at once.'
                  : 'Nothing written here yet. Add what you spend, or bring in a bank statement and the past months fill in at once.'
              }
            >
              <button type="button" class="btn btn-primary btn-sm" onClick={() => openTxn()}>
                <Icon name="plus" size={16} /> Add a transaction
              </button>
              <a class="btn btn-soft btn-sm" href={url('import/')}>
                Import a statement
              </a>
            </Empty>
          ) : (
            <Empty
              level={2}
              icon="search"
              title="Nothing matches that."
              body={
                searching
                  ? `No payee, note or category mentions “${query}”. Try fewer letters.`
                  : 'This month has nothing of that kind. Try another month or filter.'
              }
            />
          )}
        </div>
      ) : (
        <div class="grid gap-9">
          {groups.map((g, gi) => {
            const day = dayHeading(g.date, today);
            return (
              <section
                key={g.date}
                class="animate-row"
                style={{ animationDelay: `${Math.min(gi, 8) * 35}ms` }}
                aria-label={`${day.name} ${day.date}`}
              >
                <div class="border-fg flex items-baseline justify-between border-b-2 pb-1.5">
                  <h2 class="serif text-[1.3rem] font-[480]">
                    {day.name}
                    <span class="caps ml-3 align-middle">{day.date}</span>
                  </h2>
                  {g.spent > 0 && (
                    <span class="text-subtle text-sm">{formatMoney(g.spent, base)}</span>
                  )}
                </div>
                <div class="grid">
                  {g.items.map((t) =>
                    selecting ? (
                      <label key={t.id} class="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          class="size-5 flex-none accent-[var(--gold)]"
                          checked={picked.has(t.id)}
                          onChange={() => toggle(t.id)}
                          aria-label={`Select ${t.payee}`}
                        />
                        <div class="pointer-events-none min-w-0 flex-1">
                          <TxnRow t={t} data={data} cats={cats} accounts={accounts} today={today} />
                        </div>
                      </label>
                    ) : (
                      <TxnRow
                        key={t.id}
                        t={t}
                        data={data}
                        cats={cats}
                        accounts={accounts}
                        today={today}
                      />
                    ),
                  )}
                </div>
              </section>
            );
          })}
          {list.length > LIMIT && (
            <p class="text-muted text-center text-sm">
              Showing the newest {LIMIT} of {list.length}. Narrow the search to see the rest.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
