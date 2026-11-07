/** Short random ids. crypto.randomUUID where available, a Math.random fallback otherwise. */
export function uid(prefix = ''): string {
  const c = globalThis.crypto;
  const raw =
    c && 'randomUUID' in c
      ? c.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${raw}` : raw;
}

/** A small deterministic PRNG (mulberry32) for demo data and tests. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
