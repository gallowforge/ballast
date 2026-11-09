import { useEffect, useId, useRef, useState } from 'preact/hooks';
import {
  addDays,
  addMonths,
  diffDays,
  formatMonthShort,
  formatShort,
  parts,
  type ISODate,
} from '@/lib/dates';
import { formatMoney } from '@/lib/money/money';
import { useWidth } from '../ui/hooks';

interface Props {
  today: ISODate;
  /** The far end of the view: the horizon. */
  horizon: ISODate;
  /** Where the money stops (the first payday that cannot be paid), or null when it lasts. */
  runOut: ISODate | null;
  /** The last payday that is paid in full, named at the end of the road. */
  lastFull?: ISODate | null;
  target?: { date: ISODate; label: string } | null;
  start: number;
  code: string;
  height?: number;
  compact?: boolean;
  fallbackWidth?: number;
  /** How wide the road is at your feet, as a share of the width (a hero road is wider). */
  spread?: number;
}

/** Perspective: 1 at the near edge, 0 at the horizon, compressing the distance like a real road.
 *  Callers set the horizon at about twice the distance of what matters (the end of the road or
 *  the date), which puts those in the middle distance where the eye can read them. */
const K = 1;
const depth = (u: number) => (1 - u) / (1 + K * u);

/**
 * Your savings drawn as a road to the horizon. The ground is ruled like ledger paper, one line a
 * year (fainter ones each quarter); the road stops where the money does; your date is a brass
 * flag at the roadside. When the end moves (a different salary), the road eases to its new length.
 */
/** The horizon for a road: about twice as far as the end of the road or the target date. */
export function roadHorizon(today: ISODate, ...far: (ISODate | null | undefined)[]): ISODate {
  const end = far.filter(Boolean).sort().pop() as ISODate | undefined;
  const days = end ? diffDays(today, end) : 365;
  return addDays(today, Math.max(420, Math.round(days * 2.1)));
}

export function RoadView({
  today,
  horizon,
  runOut,
  lastFull,
  target,
  start,
  code,
  height = 300,
  compact,
  fallbackWidth = 900,
  spread,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(fallbackWidth);
  // Each road needs its own gradient id: a hidden copy (desktop or phone) must not be the one used.
  const fadeId = `road-fade-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const total = Math.max(1, diffDays(today, horizon));
  const at = (d: ISODate) => Math.min(1, Math.max(0, diffDays(today, d) / total));
  const endU = runOut ? at(runOut) : 1;

  // Ease the road's end to its new place.
  const [shownEnd, setShownEnd] = useState(endU);
  const from = useRef(endU);
  useEffect(() => {
    const reduce =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const a = from.current;
    from.current = endU;
    if (reduce || Math.abs(a - endU) < 0.001) {
      setShownEnd(endU);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / 520));
      const e = 1 - Math.pow(1 - p, 3);
      setShownEnd(a + (endU - a) * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [endU]);

  const W = width;
  const H = height;
  const hy = Math.round(H * (compact ? 0.2 : 0.26));
  const vx = W * (compact ? 0.5 : 0.56);
  const near = spread ? W * spread : Math.min(W * (compact ? 0.34 : 0.3), compact ? 150 : 260);
  const y = (u: number) => hy + (H - hy) * depth(u);
  const hw = (u: number) => near * depth(u);

  // Ground rules: a strong line each year, faint ones each quarter.
  const rules: { y: number; label?: string; strong: boolean }[] = [];
  const first = parts(today);
  for (let m = 1; m <= 12 * 12; m++) {
    const d = addMonths(`${first.y}-${String(first.m).padStart(2, '0')}-01`, m);
    if (d > horizon) break;
    const pm = parts(d).m;
    if ((pm - 1) % 3 !== 0) continue;
    const yy = y(at(d));
    const prev = rules[rules.length - 1];
    if (prev && Math.abs(prev.y - yy) < 5) continue;
    const lastLabel = [...rules].reverse().find((x) => x.label);
    const roomy = !lastLabel || Math.abs(lastLabel.y - yy) > 20;
    rules.push({
      y: yy,
      strong: pm === 1,
      label: pm === 1 && roomy ? String(parts(d).y) : undefined,
    });
  }

  // The road surface, from the near edge to where it ends.
  const e = Math.max(0.0001, shownEnd);
  const road = `M${vx - hw(0)},${H} L${vx - hw(e)},${y(e)} L${vx + hw(e)},${y(e)} L${vx + hw(0)},${H} Z`;

  // Centre dashes, one a month, shrinking with distance.
  const dashes: { y1: number; y2: number; w: number }[] = [];
  const months = Math.max(1, Math.round(total / 30.44));
  for (let i = 0; i < months; i++) {
    const u1 = i / months + 0.12 / months;
    const u2 = u1 + 0.46 / months;
    if (u2 > e) break;
    const w = Math.max(0.6, 5.5 * depth(u1));
    if (y(u1) - y(u2) < 0.8) break;
    dashes.push({ y1: y(u1), y2: y(u2), w });
  }

  const tU = target ? at(target.date) : null;
  const flag =
    tU !== null && target
      ? {
          x: vx + hw(tU) + Math.max(6, 18 * depth(tU)),
          y: y(tU),
          h: Math.max(16, 54 * depth(tU) + 10),
        }
      : null;
  const flagLeft = flag ? flag.x > W - 210 : false;
  const ended = runOut && shownEnd < 0.999;

  const label = runOut
    ? `Your savings, ${formatMoney(start, code)} today, last until ${formatShort(runOut)}${target ? `; your target, ${formatShort(target.date)}, is ${tU! <= endU ? 'before' : 'past'} the end of the road` : ''}.`
    : `Your savings, ${formatMoney(start, code)} today, do not run out before the horizon.`;

  return (
    <div ref={ref} class="relative" data-road>
      <svg
        class="block w-full"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={fadeId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--road)', stopOpacity: 0.94 }} />
            <stop offset="0.75" style={{ stopColor: 'var(--road)', stopOpacity: 0.55 }} />
            <stop offset="1" style={{ stopColor: 'var(--road)', stopOpacity: 0.28 }} />
          </linearGradient>
        </defs>
        {rules.map((r) => (
          <g key={r.y}>
            <line
              x1={0}
              x2={W}
              y1={r.y}
              y2={r.y}
              style={{ stroke: 'var(--fg)' }}
              stroke-opacity={r.strong ? 0.2 : 0.07}
            />
            {r.label && !compact && (
              <text
                x={2}
                y={r.y - 5}
                class="halo"
                style={{
                  fill: 'var(--subtle)',
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                }}
                font-size={Math.max(11, 16 * Math.sqrt(depth(at(`${r.label}-01-01`))) + 3)}
              >
                {r.label}
              </text>
            )}
          </g>
        ))}
        <line x1={0} x2={W} y1={hy} y2={hy} style={{ stroke: 'var(--fg)' }} stroke-opacity="0.45" />
        <circle cx={vx} cy={hy} r={compact ? 6 : 9} style={{ fill: 'var(--gold)' }} />
        <path d={road} fill={`url(#${fadeId})`} />
        <g style={{ stroke: 'var(--bg)' }} stroke-linecap="round">
          {dashes.map((d, i) => (
            <line key={i} x1={vx} x2={vx} y1={d.y1} y2={d.y2} stroke-width={d.w} />
          ))}
        </g>
        {ended && (
          <g data-road-end>
            <line
              x1={vx - hw(shownEnd) - 10}
              x2={vx + hw(shownEnd) + 10}
              y1={y(shownEnd)}
              y2={y(shownEnd)}
              style={{ stroke: 'var(--bad)' }}
              stroke-width={compact ? 2 : 3}
              stroke-linecap="round"
            />
            {!compact && (
              <text
                x={vx - hw(shownEnd) - 18}
                y={y(shownEnd) + 4}
                text-anchor="end"
                class="halo"
                style={{ fill: 'var(--bad)', fontWeight: 700, letterSpacing: '0.1em' }}
                font-size="11"
              >
                LAST SALARY · {formatMonthShort(lastFull ?? runOut!, true).toUpperCase()}
              </text>
            )}
          </g>
        )}
        {flag && target && (
          <g data-flag>
            <line
              x1={flag.x}
              x2={flag.x}
              y1={flag.y}
              y2={flag.y - flag.h}
              style={{ stroke: 'var(--gold-ink)' }}
              stroke-width={compact ? 1.5 : 2}
            />
            <path
              d={`M${flag.x},${flag.y - flag.h} l${compact ? 14 : 22},${compact ? 4 : 6} l-${compact ? 14 : 22},${compact ? 4 : 6} z`}
              style={{ fill: 'var(--gold)' }}
            />
            {!compact && (
              <text
                x={flagLeft ? flag.x - 10 : flag.x + 30}
                y={flag.y - flag.h + 10}
                text-anchor={flagLeft ? 'end' : 'start'}
                class="halo"
                style={{
                  fill: 'var(--gold-ink)',
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                }}
                font-size="17"
              >
                {target.label} · {formatShort(target.date)}
              </text>
            )}
          </g>
        )}
        {!compact && (
          <text
            x={vx - hw(0) - 10}
            y={H - 6}
            text-anchor="end"
            style={{ fill: 'var(--subtle)', fontWeight: 700, letterSpacing: '0.1em' }}
            font-size="11"
          >
            TODAY
          </text>
        )}
      </svg>
    </div>
  );
}
