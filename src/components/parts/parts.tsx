import { navigate } from 'astro:transitions/client';
import { openTxn, toast } from '@/lib/bus';
import { formatIn, formatRelative, formatShort } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import type { BudgetState } from '@/lib/calc/budgets';
import type { Insight } from '@/lib/calc/insights';
import type { Upcoming } from '@/lib/calc/recurring';
import type { Account, Category, LedgerData, Txn } from '@/lib/model';
import { addRecurring, dismiss } from '@/lib/store/ops';
import { apply, undo } from '@/lib/store/store';
import { url } from '@/lib/site';
import { CategoryTile } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';

export function SectionTitle({ title, href, link, id }: { title: string; href?: string; link?: string; id?: string }) {
  return (
    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} class="text-[0.95rem] font-bold tracking-tight">
        {title}
      </h2>
      {href && (
        <a href={url(href)} class="link inline-flex items-center gap-1 text-sm">
          {link ?? 'See all'} <Icon name="arrow-right" size={15} />
        </a>
      )}
    </div>
  );
}

export function TxnRow({ t, data, cats, accounts, today, showDate = false }: { t: Txn; data: LedgerData; cats: Map<string, Category>; accounts: Map<string, Account>; today: string; showDate?: boolean }) {
  const cat = t.categoryId ? cats.get(t.categoryId) : null;
  const acct = accounts.get(t.accountId);
  const code = acct?.currency ?? data.settings.base;
  const to = t.toAccountId ? accounts.get(t.toAccountId) : null;
  const meta =
    t.kind === 'transfer'
      ? `${acct?.name ?? 'Account'} → ${to?.name ?? 'Account'}`
      : [cat?.name ?? 'Uncategorised', acct && acct.role !== 'spending' ? acct.name : null].filter(Boolean).join(' · ');
  return (
    <button type="button" class="row-link" onClick={() => openTxn({ id: t.id })} aria-label={`${t.payee || 'Untitled'}, ${formatMoney(t.amount, code)}, ${formatShort(t.date)}. Edit`}>
      {t.kind === 'transfer' ? (
        <span class="tile" style={{ '--tile': 'var(--subtle)' }} aria-hidden="true">
          <Icon name="swap" size={19} />
        </span>
      ) : (
        <CategoryTile category={cat} />
      )}
      <span class="min-w-0 flex-1">
        <span class="block truncate font-semibold">{t.payee || 'Untitled'}</span>
        <span class={`block truncate text-sm ${!cat && t.kind !== 'transfer' ? 'text-warn' : 'text-subtle'}`}>
          {showDate ? `${formatRelative(t.date, today)} · ` : ''}
          {meta}
        </span>
      </span>
      <span class="text-right">
        <Money value={t.kind === 'expense' ? -t.amount : t.amount} code={code} sign={t.kind === 'income' ? 'always' : t.kind === 'transfer' ? 'never' : 'auto'} tone={t.kind === 'income' ? 'income' : 'none'} class="font-bold" />
        {t.original && <span class="block text-xs text-subtle">{formatMoney(t.original.amount, t.original.currency)}</span>}
        {code !== data.settings.base && !t.original && <span class="block text-xs text-subtle">{formatMoney(t.base, data.settings.base)}</span>}
      </span>
    </button>
  );
}

export function BudgetRow({ b, cat, code }: { b: BudgetState; cat?: Category; code: string }) {
  const pct = Math.min(1, b.used === Infinity ? 1 : b.used);
  const colour = b.status === 'over' ? 'var(--bad)' : b.status === 'ahead' ? 'var(--warn)' : 'var(--gold)';
  return (
    <div class="grid gap-2">
      <div class="flex items-center gap-3">
        <CategoryTile category={cat} size="sm" />
        <span class="min-w-0 flex-1 truncate font-semibold">{cat?.name ?? 'Category'}</span>
        <span class="text-sm text-muted">
          <Money value={b.spent} code={code} class="font-bold text-fg" /> of <Money value={b.available} code={code} />
        </span>
      </div>
      <div
        class="bar"
        role="meter"
        aria-label={`${cat?.name ?? 'Budget'}: ${formatMoney(b.spent, code)} spent of ${formatMoney(b.available, code)}`}
        aria-valuemin={0}
        aria-valuemax={b.available}
        aria-valuenow={Math.min(b.spent, b.available)}
      >
        <span style={{ width: `${pct * 100}%`, background: colour }} />
        <i class="absolute top-[-3px] bottom-[-3px] w-0.5 rounded bg-fg/60" style={{ left: `${b.elapsed * 100}%` }} title="Where an even pace would be today" />
      </div>
      <div class="flex justify-between text-xs font-semibold text-subtle">
        <span class={b.status === 'over' ? 'text-bad' : b.status === 'ahead' ? 'text-warn' : ''}>
          {b.status === 'over' ? `${formatMoney(-b.left, code)} over` : b.status === 'ahead' ? 'Ahead of pace' : b.status === 'idle' ? 'Nothing spent yet' : 'On pace'}
        </span>
        <span>{b.left > 0 ? `${formatMoney(b.left, code)} left · ${formatMoney(b.perDayLeft, code)} a day` : 'Nothing left this month'}</span>
      </div>
    </div>
  );
}

export function UpcomingRow({ u, cat, code, today }: { u: Upcoming; cat?: Category; code: string; today: string }) {
  return (
    <div class="flex items-center gap-3 py-2.5">
      <CategoryTile category={cat} size="sm" />
      <div class="min-w-0 flex-1">
        <div class="truncate font-semibold">{u.recurring.name}</div>
        <div class="text-sm text-subtle">
          {formatShort(u.date, today)} · {formatIn(u.date, today)}
        </div>
      </div>
      <Money value={u.recurring.kind === 'income' ? u.recurring.amount : -u.recurring.amount} code={code} sign={u.recurring.kind === 'income' ? 'always' : 'auto'} tone={u.recurring.kind === 'income' ? 'income' : 'none'} class="font-bold" />
    </div>
  );
}

const TONE: Record<Insight['tone'], string> = { good: 'var(--good)', neutral: 'var(--gold)', warn: 'var(--warn)' };

export function InsightCard({ i, compact }: { i: Insight; compact?: boolean }) {
  const act = () => {
    const a = i.action;
    if (!a) return;
    if (a.kind === 'link') return navigate(url(a.href));
    const s = a.suggestion;
    apply(
      addRecurring({ name: s.payee, kind: 'expense', amount: s.amount, accountId: s.accountId, categoryId: s.categoryId, every: s.every, unit: s.unit, startOn: s.last, autoPost: false, lastPostedOn: s.last }),
      'Track recurring',
    );
    toast({ message: `Tracking ${s.payee} ${s.unit === 'month' ? 'monthly' : s.unit === 'week' ? 'weekly' : 'yearly'}`, tone: 'good', action: { label: 'Undo', run: () => undo() } });
  };
  return (
    <article class={`flex gap-3.5 ${compact ? '' : 'card card-pad'}`}>
      <span class="tile" style={{ '--tile': TONE[i.tone] }} aria-hidden="true">
        <Icon name={i.icon} size={19} />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="leading-snug font-bold">{i.title}</h3>
        <p class="mt-1 text-sm text-muted">{i.body}</p>
        <div class="mt-2.5 flex flex-wrap gap-2">
          {i.action && (
            <button type="button" class="btn btn-soft btn-sm" onClick={act}>
              {i.action.label}
            </button>
          )}
          <button type="button" class="btn btn-ghost btn-sm px-2.5 text-subtle" onClick={() => apply(dismiss(i.id), 'Dismiss')}>
            Dismiss
          </button>
        </div>
      </div>
    </article>
  );
}

export function DemoBanner() {
  return (
    <div class="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm">
      <Icon name="sparkle" size={18} class="text-gold-ink" />
      <span class="flex-1 font-semibold">You are looking at demo data for a made-up person. Nothing here is real.</span>
      <a href={url('settings/#data')} class="link">
        Clear it and start yours
      </a>
    </div>
  );
}
