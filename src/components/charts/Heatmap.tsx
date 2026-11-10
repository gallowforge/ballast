import { addDays, formatShort, parts, weekday, type ISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Four shades, as a share of ink mixed into the paper, each with the text colour that reads on it.
 * The middle of the range is skipped on purpose: between about 40% and 65% neither ink nor paper
 * text reaches 4.5:1 in one theme or the other. Measured (ink text / paper text): light 8.8, 6.2,
 * 4.8, 8.0; dark 9.1, 5.8, 6.1, 9.4.
 */
export const HEAT = [
  { mix: 14, text: 'var(--fg)' },
  { mix: 30, text: 'var(--fg)' },
  { mix: 68, text: 'var(--raised)' },
  { mix: 86, text: 'var(--raised)' },
] as const;

/** Which of the four shades a day gets: 0 for the lightest, by the square root of its share. */
export function heatLevel(value: number, max: number): number {
  const r = Math.sqrt(Math.max(0, value) / Math.max(1, max));
  return Math.min(HEAT.length - 1, Math.floor(r * HEAT.length - 1e-9));
}

/** Each day of the period as a square, darker the more was spent. */
export function Heatmap({
  days,
  code,
  today,
}: {
  days: Map<ISODate, number>;
  code: string;
  today: ISODate;
}) {
  const list = [...days];
  if (!list.length) return null;
  const max = Math.max(1, ...list.map(([, v]) => v));
  const first = list[0]![0];
  const lead = weekday(first);
  const cells: ({ date: ISODate; value: number } | null)[] = [
    ...Array(lead).fill(null),
    ...list.map(([date, value]) => ({ date, value })),
  ];
  return (
    <div>
      <div
        class="text-subtle grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold"
        aria-hidden="true"
      >
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
              class={`relative grid aspect-square place-items-center rounded-[3px] text-[11px] font-bold ${c.date > today ? 'border-line-strong border border-dashed' : ''} ${c.date === today ? 'ring-gold ring-2' : ''}`}
              style={
                c.date > today || !c.value
                  ? {
                      background: c.date > today ? 'transparent' : 'var(--sunken)',
                      color: 'var(--fg)',
                    }
                  : {
                      background: `color-mix(in oklab, var(--fg) ${HEAT[heatLevel(c.value, max)]!.mix}%, var(--raised))`,
                      color: HEAT[heatLevel(c.value, max)]!.text,
                    }
              }
            >
              {parts(c.date).d}
            </div>
          ) : (
            <div key={`x${i}`} aria-hidden="true" />
          ),
        )}
      </div>
      <div
        class="text-subtle mt-3 flex items-center justify-end gap-1.5 text-[11px] font-semibold"
        aria-hidden="true"
      >
        Less
        {HEAT.map((h) => (
          <span
            key={h.mix}
            class="size-3 rounded"
            style={{ background: `color-mix(in oklab, var(--fg) ${h.mix}%, var(--raised))` }}
          />
        ))}
        More
      </div>
      <span class="sr-only">Last day {formatShort(addDays(first, list.length - 1))}</span>
    </div>
  );
}
