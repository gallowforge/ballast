import type { ComponentChildren } from 'preact';
import { navigate } from 'astro:transitions/client';
import { openTxn, toast } from '@/lib/bus';
import { diffDays, formatIn, formatShort, formatWeekday } from '@/lib/dates';

/** A date for the narrow ledger column: Today, Yest., Thu, or 4 Nov. */
function shortDay(date: string, today: string): string {
  const n = diffDays(today, date);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yest.';
  if (n < 0 && n > -7) return formatWeekday(date, true);
  return formatShort(date, today);
}
import { formatMoney } from '@/lib/money/money';
import type { BudgetState } from '@/lib/calc/budgets';
import type { Insight } from '@/lib/calc/insights';
import type { Upcoming } from '@/lib/calc/recurring';
import type { Account, Category, LedgerData, Txn } from '@/lib/model';
import { addRecurring, dismiss } from '@/lib/store/ops';
import { apply, undo } from '@/lib/store/store';
import { url } from '@/lib/site';
import { Icon } from '../ui/Icon';
import { Money } from '../ui/Money';

export const catColor = (c?: Category | null) =>
  c ? `oklch(var(--cat-l) 0.1 ${c.hue})` : 'var(--subtle)';

/** A category as ledgers mark it: a small square of its colour. */
export function Swatch({ category }: { category?: Category | null }) {
  return <span class="swatch" style={{ '--tile': catColor(category) }} aria-hidden="true" />;
}

/** A section heading sitting on a heavy rule, like a ledger page head. */
export function SectionTitle({
  title,
  href,
  link,
  id,
  children,
}: {
  title: string;
  href?: string;
  link?: string;
  id?: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="border-fg mb-1 flex items-baseline justify-between gap-3 border-b-2 pb-2">
      <h2 id={id} class="serif text-[1.45rem] leading-tight font-[480]">
        {title}
      </h2>
      {children}
      {href && (
        <a href={url(href)} class="link shrink-0 text-sm whitespace-nowrap">
          {link ?? 'See all'}
        </a>
      )}
    </div>
  );
}

export function TxnRow({
  t,
  data,
  cats,
  accounts,
  today,
  showDate = false,
}: {
  t: Txn;
  data: LedgerData;
  cats: Map<string, Category>;
  accounts: Map<string, Account>;
  today: string;
  showDate?: boolean;
}) {
  const cat = t.categoryId ? cats.get(t.categoryId) : null;
  const acct = accounts.get(t.accountId);
  const code = acct?.currency ?? data.settings.base;
  const to = t.toAccountId ? accounts.get(t.toAccountId) : null;
  const meta =
    t.kind === 'transfer'
      ? `${acct?.name ?? 'Account'} to ${to?.name ?? 'account'}`
      : [cat?.name ?? 'Needs a category', acct && acct.role !== 'spending' ? acct.name : null]
          .filter(Boolean)
          .join(' · ');
  return (
    <button type="button" class="row-link" onClick={() => openTxn({ id: t.id })}>
      {showDate && (
        <span class="caps hidden w-14 flex-none sm:block">{shortDay(t.date, today)}</span>
      )}
      <span class="min-w-0 flex-1">
        <span class="block truncate font-bold">{t.payee || 'Untitled'}</span>
        <span
          class={`mt-0.5 flex items-center gap-2 text-[0.82rem] ${!cat && t.kind !== 'transfer' ? 'text-warn' : 'text-subtle'}`}
        >
          {t.kind === 'transfer' ? <Icon name="swap" size={13} /> : <Swatch category={cat} />}
          <span class="truncate">{meta}</span>
        </span>
      </span>
      <span class="text-right">
        <Money
          value={t.kind === 'expense' ? -t.amount : t.amount}
          code={code}
          sign={t.kind === 'income' ? 'always' : t.kind === 'transfer' ? 'never' : 'auto'}
          tone={t.kind === 'income' ? 'income' : 'none'}
          class="text-[1.12rem]"
        />
        {t.original && (
          <span class="text-subtle block text-xs">
            {formatMoney(t.original.amount, t.original.currency)}
          </span>
        )}
        {code !== data.settings.base && !t.original && (
          <span class="text-subtle block text-xs">{formatMoney(t.base, data.settings.base)}</span>
        )}
      </span>
    </button>
  );
}

/** A budget as a ledger line: spent against the line, a brass tick where an even pace is today. */
export function BudgetRow({ b, cat, code }: { b: BudgetState; cat?: Category; code: string }) {
  const pct = Math.min(1, b.used === Infinity ? 1 : b.used);
  const colour =
    b.status === 'over' ? 'var(--bad)' : b.status === 'ahead' ? 'var(--warn)' : 'var(--fg)';
  return (
    <div class="grid gap-2 py-3">
      <div class="flex items-baseline gap-3">
        <Swatch category={cat} />
        <span class="min-w-0 flex-1 truncate font-bold">{cat?.name ?? 'Category'}</span>
        <span class="text-subtle text-sm">
          <Money value={b.spent} code={code} unit={false} class="text-fg text-[1.08rem]" /> of{' '}
          <Money value={b.available} code={code} />
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
        <i
          class="bg-gold absolute -top-1.5 -bottom-1.5 w-[2px]"
          style={{ left: `${b.elapsed * 100}%` }}
          title="Where an even pace would be today"
        />
      </div>
      <div class="text-subtle flex justify-between gap-3 text-[0.8rem]">
        <span
          class={
            b.status === 'over'
              ? 'text-bad font-bold'
              : b.status === 'ahead'
                ? 'text-warn font-bold'
                : ''
          }
        >
          {b.status === 'over'
            ? `${formatMoney(-b.left, code)} past the line`
            : b.status === 'ahead'
              ? 'A little ahead of pace'
              : b.status === 'idle'
                ? 'Nothing yet'
                : 'On pace'}
        </span>
        <span>
          {b.left > 0 ? `${formatMoney(b.perDayLeft, code)} a day left` : 'Nothing left this month'}
        </span>
      </div>
    </div>
  );
}

export function UpcomingRow({
  u,
  cat,
  code,
  today,
}: {
  u: Upcoming;
  cat?: Category;
  code: string;
  today: string;
}) {
  return (
    <div class="border-line flex items-baseline gap-4 border-b py-3">
      <span class="caps w-14 flex-none">{formatShort(u.date, today)}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 truncate font-bold">
          <Swatch category={cat} />
          {u.recurring.name}
        </div>
        <div class="text-subtle text-[0.8rem]">{formatIn(u.date, today)}</div>
      </div>
      <Money
        value={u.recurring.kind === 'income' ? u.recurring.amount : -u.recurring.amount}
        code={code}
        sign={u.recurring.kind === 'income' ? 'always' : 'auto'}
        tone={u.recurring.kind === 'income' ? 'income' : 'none'}
        class="text-[1.08rem]"
      />
    </div>
  );
}

const TONE: Record<Insight['tone'], { label: string; cls: string }> = {
  good: { label: 'Good news', cls: 'text-good' },
  neutral: { label: 'Worth knowing', cls: 'text-gold-ink' },
  warn: { label: 'Heads up', cls: 'text-warn' },
};

/** An observation, written like a note in the margin of the ledger. */
export function InsightCard({ i, compact }: { i: Insight; compact?: boolean }) {
  const act = () => {
    const a = i.action;
    if (!a) return;
    if (a.kind === 'link') return navigate(url(a.href));
    const s = a.suggestion;
    apply(
      addRecurring({
        name: s.payee,
        kind: 'expense',
        amount: s.amount,
        accountId: s.accountId,
        categoryId: s.categoryId,
        every: s.every,
        unit: s.unit,
        startOn: s.last,
        autoPost: false,
        lastPostedOn: s.last,
      }),
      'Track recurring',
    );
    toast({
      message: `${s.payee} is on the list now. You'll see it coming.`,
      tone: 'good',
      action: { label: 'Undo', run: () => undo() },
    });
  };
  const tone = TONE[i.tone];
  return (
    <article
      class={`border-l-2 py-1 pl-4 ${i.tone === 'warn' ? 'border-warn' : i.tone === 'good' ? 'border-good' : 'border-gold'} ${compact ? '' : 'pr-2'}`}
    >
      <p class={`caps ${tone.cls}`}>{tone.label}</p>
      <h3 class="serif mt-1 text-[1.2rem] leading-snug font-[470]">{i.title}</h3>
      <p class="text-muted mt-1 text-[0.92rem]">{i.body}</p>
      <div class="mt-2 flex flex-wrap items-center gap-4 text-sm">
        {i.action && (
          <button type="button" class="link" onClick={act}>
            {i.action.label}
          </button>
        )}
        <button
          type="button"
          class="tap text-subtle hover:text-fg font-bold"
          onClick={() => apply(dismiss(i.id), 'Dismiss')}
        >
          Not now
        </button>
      </div>
    </article>
  );
}

export function DemoBanner() {
  return (
    <div
      data-demo-note
      class="border-gold flex flex-wrap items-baseline gap-x-4 gap-y-1 border-l-2 py-1 pl-4"
    >
      <p class="serif text-[1.05rem] italic">
        These are Alex's books, and Alex is made up. Nothing here is real.
      </p>
      <a href={url('settings/#data')} class="link text-sm">
        Start your own
      </a>
    </div>
  );
}
