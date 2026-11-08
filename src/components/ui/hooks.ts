import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { today as todayISO } from '@/lib/dates';
import type { LedgerData } from '@/lib/model';
import { boot } from '@/lib/client';
import { getState, isReady, subscribe } from '@/lib/store/store';

/** The data and whether it has loaded. Re-renders on every change. */
export function useLedger(): { data: LedgerData; ready: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const off = subscribe(() => force((n) => n + 1));
    void boot().then(() => force((n) => n + 1));
    return off;
  }, []);
  return { data: getState(), ready: isReady() };
}

/** Today's date, updated when the day changes while the app is open. */
export function useToday(): string {
  const [day, setDay] = useState(() => todayISO());
  useEffect(() => {
    const check = () => setDay((d) => (d === todayISO() ? d : todayISO()));
    const id = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return day;
}

/** The width of an element, for charts that draw at real pixel size. */
export function useWidth<T extends HTMLElement>(fallback = 640): [preact.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    const ro = new ResizeObserver(
      ([entry]) => entry && setWidth(Math.round(entry.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Counts a number up to its value once, with an ease-out (instant with reduced motion). */
export function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = from.current ?? 0;
    from.current = value;
    if (reduce || start === value) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 4);
      setShown(Math.round(start + (value - start) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** Runs a handler for a key when no field has focus. */
export function useKey(
  key: string,
  handler: (e: KeyboardEvent) => void,
  deps: unknown[] = [],
): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === key) handler(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, deps);
}
