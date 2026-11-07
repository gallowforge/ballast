import { addMonths, diffDays, parts, type ISODate } from '@/lib/dates';

export function linear(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** "Nice" ticks: 0, 1k, 2k, 3k… covering the max with about `count` steps. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v));
  if (out[out.length - 1]! < max) out.push(Math.round(out[out.length - 1]! + step));
  return out;
}

/** Month starts between two dates, thinned to fit the width (one label per ~80 px). */
export function monthTicks(from: ISODate, to: ISODate, width: number): ISODate[] {
  const out: ISODate[] = [];
  const p = parts(from);
  let d = `${String(p.y).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-01`;
  if (d < from) d = addMonths(d, 1);
  for (; d <= to; d = addMonths(d, 1)) out.push(d);
  const room = Math.max(1, Math.floor(width / 78));
  const every = Math.max(1, Math.ceil(out.length / room));
  const steps = [1, 2, 3, 4, 6, 12, 24];
  const step = steps.find((s) => s >= every) ?? every;
  return out.filter((t) => (parts(t).m - 1) % step === 0);
}

export function dayScale(from: ISODate, to: ISODate, r0: number, r1: number) {
  const total = Math.max(1, diffDays(from, to));
  return (d: ISODate) => r0 + (diffDays(from, d) / total) * (r1 - r0);
}
