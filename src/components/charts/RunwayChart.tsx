import { useMemo, useState } from 'preact/hooks';
import { formatMonthShort, formatShort, parts, type ISODate } from '@/lib/dates';
import { formatCompact, formatMoney } from '@/lib/money/money';
import type { RunwayPoint } from '@/lib/calc/runway';
import { useWidth } from '../ui/hooks';
import { dayScale, linear, monthTicks, niceTicks } from './scale';

interface Props {
  points: RunwayPoint[];
  compare?: RunwayPoint[];
  floor: number;
  target?: { date: ISODate; label: string } | null;
  runOut?: ISODate | null;
  code: string;
  height?: number;
  label: string;
  compact?: boolean;
  /** Width to draw before the page measures the real one (server-rendered previews). */
  fallbackWidth?: number;
}

function stepPath(pts: RunwayPoint[], x: (d: ISODate) => number, y: (v: number) => number): string {
  if (!pts.length) return '';
  let d = `M${x(pts[0]!.date).toFixed(1)},${y(pts[0]!.balance).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    d += `H${x(p.date).toFixed(1)}V${y(p.balance).toFixed(1)}`;
  }
  return d;
}

/** Savings over time as a staircase: each step is a payday or a known income or cost. */
export function RunwayChart({ points, compare, floor, target, runOut, code, height = 280, label, compact, fallbackWidth = 720 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(fallbackWidth);
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: compact ? 8 : 52, r: compact ? 8 : 18, t: compact ? 10 : 30, b: compact ? 8 : 28 };
  const from = points[0]?.date;
  const to = points[points.length - 1]?.date;

  const geo = useMemo(() => {
    if (!from || !to) return null;
    const max = Math.max(floor, ...points.map((p) => p.balance), ...(compare ?? []).map((p) => p.balance), 1);
    const ticks = niceTicks(max, compact ? 2 : 4);
    const top = ticks[ticks.length - 1]!;
    const x = dayScale(from, to, pad.l, width - pad.r);
    const y = linear(0, top, height - pad.b, pad.t);
    return { x, y, ticks, line: stepPath(points, x, y), cmp: compare ? stepPath(compare, x, y) : '' };
  }, [points, compare, width, height, floor]);

  if (!geo || !from || !to) return <div ref={ref} style={{ height }} />;
  const { x, y, ticks, line } = geo;
  const area = `${line}V${y(0)}H${x(from)}Z`;
  const months = compact ? [] : monthTicks(from, to, width - pad.l - pad.r);
  const active = hover !== null ? points[hover] : null;

  const onMove = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    setHover(best);
  };

  const summary = `${label}. Starts at ${formatMoney(points[0]!.balance, code)} on ${formatShort(from)}${runOut ? `, falls below the floor on ${formatShort(runOut)}` : ', and does not run out in this view'}.`;

  return (
    <div ref={ref} class="relative">
      <svg
        class="chart block w-full touch-pan-y"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={summary}
        tabIndex={compact ? -1 : 0}
        onPointerMove={(e) => onMove(e.clientX, (e.currentTarget as SVGElement).getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          setHover((h) => Math.max(0, Math.min(points.length - 1, (h ?? 0) + (e.key === 'ArrowRight' ? 1 : -1))));
        }}
        onBlur={() => setHover(null)}
      >
        <defs>
          <linearGradient id="rw-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--gold)', stopOpacity: 0.34 }} />
            <stop offset="1" style={{ stopColor: 'var(--gold)', stopOpacity: 0.02 }} />
          </linearGradient>
          <linearGradient id="rw-danger" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--bad)', stopOpacity: 0.1 }} />
            <stop offset="1" style={{ stopColor: 'var(--bad)', stopOpacity: 0.02 }} />
          </linearGradient>
        </defs>
        {!compact &&
          ticks.map((t) => (
            <g key={t}>
              <line class="grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 10} y={y(t) + 4} text-anchor="end">
                {formatCompact(t, code)}
              </text>
            </g>
          ))}
        {floor > 0 && (
          <g>
            <rect x={pad.l} y={y(floor)} width={width - pad.l - pad.r} height={y(0) - y(floor)} fill="url(#rw-danger)" />
            <line x1={pad.l} x2={width - pad.r} y1={y(floor)} y2={y(floor)} style={{ stroke: 'var(--bad)' }} stroke-opacity="0.55" stroke-dasharray="4 5" />
            {!compact && (
              <text x={pad.l + 6} y={y(floor) - 6} style={{ fill: 'var(--bad)' }}>
                Floor {formatCompact(floor, code)}
              </text>
            )}
          </g>
        )}
        <path d={area} fill="url(#rw-fill)" class="reveal" />
        {geo.cmp && <path d={geo.cmp} fill="none" style={{ stroke: 'var(--fg)' }} stroke-opacity="0.55" stroke-width="1.75" stroke-dasharray="5 5" />}
        <path d={line} fill="none" style={{ stroke: 'var(--gold)' }} stroke-width={compact ? 2 : 2.5} stroke-linejoin="round" pathLength={1} class="draw" />
        {target && target.date >= from && target.date <= to && (
          <g>
            <line x1={x(target.date)} x2={x(target.date)} y1={pad.t - (compact ? 0 : 14)} y2={y(0)} style={{ stroke: 'var(--fg)' }} stroke-opacity="0.45" stroke-dasharray="2 4" />
            {!compact && (
              <text
                x={x(target.date)}
                y={pad.t - 18}
                text-anchor={x(target.date) > width - 120 ? 'end' : x(target.date) < pad.l + 80 ? 'start' : 'middle'}
                style={{ fill: 'var(--fg)', fontWeight: 700 }}
              >
                {target.label} · {formatShort(target.date)}
              </text>
            )}
          </g>
        )}
        {runOut && runOut >= from && runOut <= to && (() => {
          const p = points.find((pt) => pt.date >= runOut) ?? points[points.length - 1]!;
          return <circle cx={x(runOut)} cy={y(p.balance)} r={compact ? 3.5 : 5} style={{ fill: 'var(--bad)', stroke: 'var(--raised)' }} stroke-width="2" />;
        })()}
        <circle cx={x(from)} cy={y(points[0]!.balance)} r={compact ? 3.5 : 5} style={{ fill: 'var(--gold)', stroke: 'var(--raised)' }} stroke-width="2" />
        {months.map((m) => (
          <text key={m} x={x(m)} y={height - 8} text-anchor={x(m) > width - pad.r - 30 ? 'end' : x(m) < pad.l + 30 ? 'start' : 'middle'}>
            {parts(m).m === 1 || m === months[0] ? formatMonthShort(m, true) : formatMonthShort(m)}
          </text>
        ))}
        {active && (
          <g>
            <line x1={x(active.date)} x2={x(active.date)} y1={pad.t} y2={y(0)} style={{ stroke: 'var(--fg)' }} stroke-opacity="0.25" />
            <circle cx={x(active.date)} cy={y(active.balance)} r="5.5" style={{ fill: 'var(--raised)', stroke: 'var(--gold)' }} stroke-width="2.5" />
          </g>
        )}
      </svg>
      {active && (
        <div
          class="pointer-events-none absolute top-1 rounded-xl border border-line bg-raised px-3 py-2 text-sm shadow-lg"
          style={{ left: Math.min(Math.max(x(active.date) - 80, 0), width - 170), width: 160 }}
          aria-live="polite"
        >
          <div class="text-xs font-semibold text-subtle">{formatShort(active.date)}</div>
          <div class="font-bold">{formatMoney(active.balance, code)}</div>
        </div>
      )}
    </div>
  );
}
