import { useState } from 'preact/hooks';
import { formatMonthShort } from '@/lib/dates';
import { formatCompact, formatMoney } from '@/lib/money/money';
import type { CashflowRow } from '@/lib/calc/stats';
import { useWidth } from '../ui/hooks';
import { linear, niceTicks } from './scale';

/** Money in and money out per month, side by side, with the difference marked. */
export function Cashflow({
  rows,
  code,
  height = 240,
}: {
  rows: CashflowRow[];
  code: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 46, r: 8, t: 14, b: 26 };
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.spending]));
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1]!;
  const y = linear(0, top, height - pad.b, pad.t);
  const band = (width - pad.l - pad.r) / Math.max(1, rows.length);
  const bw = Math.min(18, band * 0.28);
  const summary = rows
    .map(
      (r) =>
        `${formatMonthShort(r.cycle.start, true)}: in ${formatMoney(r.income, code)}, out ${formatMoney(r.spending, code)}`,
    )
    .join('; ');
  const active = hover !== null ? rows[hover] : null;
  return (
    <div ref={ref} class="relative">
      <svg
        class="chart block w-full"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Money in and out by month. ${summary}`}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line class="grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 10} y={y(t) + 4} text-anchor="end">
              {formatCompact(t, code)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = pad.l + band * i + band / 2;
          return (
            <g
              key={r.cycle.start}
              onPointerEnter={() => setHover(i)}
              style={{ animation: `rise .6s var(--ease-out-quint) ${i * 40}ms backwards` }}
            >
              <rect
                x={pad.l + band * i}
                y={pad.t}
                width={band}
                height={height - pad.t - pad.b}
                fill="transparent"
              />
              {hover === i && (
                <rect
                  x={pad.l + band * i + 2}
                  y={pad.t}
                  width={band - 4}
                  height={height - pad.t - pad.b}
                  rx="10"
                  style={{ fill: 'var(--sunken)' }}
                />
              )}
              <rect
                x={cx - bw - 2}
                y={y(r.income)}
                width={bw}
                height={Math.max(0, y(0) - y(r.income))}
                rx={Math.min(5, bw / 2)}
                style={{ fill: 'var(--good)' }}
                fill-opacity="0.85"
              />
              <rect
                x={cx + 2}
                y={y(r.spending)}
                width={bw}
                height={Math.max(0, y(0) - y(r.spending))}
                rx={Math.min(5, bw / 2)}
                style={{ fill: 'var(--gold)' }}
              />
              <text
                x={cx}
                y={height - 8}
                text-anchor="middle"
                style={hover === i ? { fill: 'var(--fg)', fontWeight: 700 } : undefined}
              >
                {formatMonthShort(r.cycle.start)}
              </text>
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div
          class="border-line bg-raised pointer-events-none absolute top-0 rounded-xl border px-3 py-2 text-sm shadow-lg"
          style={{
            left: Math.min(Math.max(pad.l + band * hover + band / 2 - 90, 0), width - 180),
            width: 180,
          }}
        >
          <div class="text-subtle text-xs font-semibold">
            {formatMonthShort(active.cycle.start, true)}
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-good">In</span>
            <b>{formatMoney(active.income, code)}</b>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-gold-ink">Out</span>
            <b>{formatMoney(active.spending, code)}</b>
          </div>
          <div class="border-line mt-1 flex justify-between gap-2 border-t pt-1">
            <span class="text-muted">Net</span>
            <b>{formatMoney(active.net, code, { sign: 'always' })}</b>
          </div>
        </div>
      )}
    </div>
  );
}
