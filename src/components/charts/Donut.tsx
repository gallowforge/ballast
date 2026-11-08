import type { ComponentChildren } from 'preact';

export interface Slice {
  id: string;
  label: string;
  value: number;
  color: string;
}

/** A ring of shares with something meaningful in the middle. */
export function Donut({
  slices,
  size = 200,
  thickness = 22,
  children,
  label,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  children?: ComponentChildren;
  label: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? Math.min(6, c * 0.012) : 0;
  let offset = 0;
  return (
    <div class="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        class="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: 'var(--sunken)' }}
          stroke-width={thickness}
        />
        {slices.map((s, i) => {
          const len = (s.value / total) * c;
          const dash = Math.max(0, len - gap);
          const el = (
            <circle
              key={s.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              stroke-width={thickness}
              stroke-linecap="butt"
              stroke-dasharray={`${dash} ${c - dash}`}
              stroke-dashoffset={-offset}
              style={{ animation: `fade .6s ease-out ${i * 60}ms backwards` }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div class="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
