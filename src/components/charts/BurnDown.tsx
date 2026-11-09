import { addDays, diffDays, formatShort, type Cycle } from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import type { DayPoint } from '@/lib/calc/cycle';
import { useWidth } from '../ui/hooks';
import { linear } from './scale';

interface Props {
  cycle: Cycle;
  allowance: number;
  actual: DayPoint[];
  projectedEnd: number;
  code: string;
  height?: number;
  fallbackWidth?: number;
}

/** What is left of the month's money, day by day, against an even pace to zero. */
export function BurnDown({
  cycle,
  allowance,
  actual,
  projectedEnd,
  code,
  height = 150,
  fallbackWidth = 420,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(fallbackWidth);
  if (!allowance || !actual.length) return <div ref={ref} style={{ height }} />;
  const pad = { l: 4, r: 4, t: 12, b: 22 };
  const lo = Math.min(0, projectedEnd, ...actual.map((p) => p.value));
  const hi = Math.max(allowance, ...actual.map((p) => p.value));
  const x = (i: number) => pad.l + (i / Math.max(1, cycle.days - 1)) * (width - pad.l - pad.r);
  const y = linear(lo, hi, height - pad.b, pad.t);
  const pts = actual.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const line = `M${pts.join('L')}`;
  const lastI = actual.length - 1;
  const area = `${line}L${x(lastI)},${y(lo)}L${x(0)},${y(lo)}Z`;
  const last = actual[lastI]!;
  const endI = cycle.days - 1;
  const summary = `${formatMoney(last.value, code)} of ${formatMoney(allowance, code)} left on day ${lastI + 1} of ${cycle.days}. At this pace the month ends with ${formatMoney(projectedEnd, code)}.`;
  return (
    <div ref={ref}>
      <svg
        class="chart block w-full"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={summary}
      >
        <defs>
          <linearGradient id="bd-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--fg)', stopOpacity: 0.13 }} />
            <stop offset="1" style={{ stopColor: 'var(--fg)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <line class="grid" x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} />
        <line
          x1={x(0)}
          y1={y(allowance)}
          x2={x(endI)}
          y2={y(0)}
          style={{ stroke: 'var(--fg)' }}
          stroke-opacity="0.3"
          stroke-dasharray="3 5"
          stroke-width="1.5"
        />
        <path d={area} fill="url(#bd-fill)" class="reveal" />
        <path
          d={line}
          fill="none"
          style={{ stroke: 'var(--fg)' }}
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          pathLength={1}
          class="draw"
        />
        {lastI < endI && (
          <line
            x1={x(lastI)}
            y1={y(last.value)}
            x2={x(endI)}
            y2={y(projectedEnd)}
            style={{ stroke: projectedEnd < 0 ? 'var(--bad)' : 'var(--fg)' }}
            stroke-opacity="0.7"
            stroke-width="2"
            stroke-dasharray="1 5"
            stroke-linecap="round"
          />
        )}
        <circle
          cx={x(lastI)}
          cy={y(last.value)}
          r="5"
          style={{ fill: 'var(--gold)', stroke: 'var(--raised)' }}
          stroke-width="2.5"
        />
        <text x={pad.l} y={height - 4}>
          {formatShort(cycle.start)}
        </text>
        <text x={width - pad.r} y={height - 4} text-anchor="end">
          {formatShort(addDays(cycle.start, endI))}
        </text>
        {diffDays(cycle.start, last.date) > 2 && diffDays(last.date, cycle.end) > 2 && (
          <text
            x={x(lastI)}
            y={height - 4}
            text-anchor="middle"
            style={{ fill: 'var(--gold-ink)', fontWeight: 700 }}
          >
            Today
          </text>
        )}
      </svg>
    </div>
  );
}
