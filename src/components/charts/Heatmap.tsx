import { addDays, formatShort, parts, weekday, type ISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Each day of the period as a square, darker the more was spent. */
export function Heatmap({ days, code, today }: { days: Map<ISODate, number>; code: string; today: ISODate }) {
  const list = [...days];
  if (!list.length) return null;
  const max = Math.max(1, ...list.map(([, v]) => v));
  const first = list[0]![0];
  const lead = weekday(first);
  const cells: ({ date: ISODate; value: number } | null)[] = [...Array(lead).fill(null), ...list.map(([date, value]) => ({ date, value }))];
  return (
    <div>
      <div class="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-subtle" aria-hidden="true">
        {DAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div class="mt-1.5 grid grid-cols-7 gap-1.5" role="list" aria-label="Spending by day">
        {cells.map((c, i) =>
          c ? (
            <div
              role="listitem"
              key={c.date}
              title={`${formatShort(c.date)}: ${formatMoney(c.value, code)}`}
              aria-label={`${DAY_NAMES[weekday(c.date)]} ${formatShort(c.date)}: ${c.value ? formatMoney(c.value, code) : 'nothing spent'}`}
              class={`relative grid aspect-square place-items-center rounded-lg text-[11px] font-bold ${c.date > today ? 'opacity-35' : ''} ${c.date === today ? 'ring-2 ring-gold' : ''}`}
              style={{
                background: c.value ? `oklch(from var(--gold) l c h / ${0.12 + 0.78 * Math.sqrt(c.value / max)})` : 'var(--sunken)',
                color: c.value / max > 0.45 ? 'var(--on-gold)' : 'var(--muted)',
              }}
            >
              {parts(c.date).d}
            </div>
          ) : (
            <div key={`x${i}`} aria-hidden="true" />
          ),
        )}
      </div>
      <div class="mt-3 flex items-center justify-end gap-1.5 text-[11px] font-semibold text-subtle" aria-hidden="true">
        Less
        {[0.12, 0.35, 0.6, 0.9].map((o) => (
          <span key={o} class="size-3 rounded" style={{ background: `oklch(from var(--gold) l c h / ${o})` }} />
        ))}
        More
      </div>
      <span class="sr-only">Last day {formatShort(addDays(first, list.length - 1))}</span>
    </div>
  );
}
