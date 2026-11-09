import { useWidth } from '../ui/hooks';

/** A small line with no axes, for cards. */
export function Spark({
  values,
  height = 44,
  color = 'var(--fg)',
}: {
  values: number[];
  height?: number;
  color?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(200);
  if (values.length < 2) return <div ref={ref} style={{ height }} />;
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, 1);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <div ref={ref} aria-hidden="true">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} class="block w-full">
        <path
          d={`${d}L${x(values.length - 1)},${height}L${x(0)},${height}Z`}
          style={{ fill: color }}
          fill-opacity="0.12"
        />
        <path
          d={d}
          fill="none"
          style={{ stroke: color }}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          pathLength={1}
          class="draw"
        />
      </svg>
    </div>
  );
}
