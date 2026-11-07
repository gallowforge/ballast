import { describe, expect, it } from 'vitest';
import { sanitize } from '../backup';
import { cycleSummary } from '../calc/cycle';
import { runway } from '../calc/runway';
import { insights } from '../calc/insights';
import { buildDemo } from '../demo';
import { catchUp } from '../store/ops';
import { balance } from '../ledger';

describe('demo data', () => {
  for (const today of ['2026-11-08', '2027-02-28', '2026-12-01', '2027-06-17']) {
    it(`is complete and consistent on ${today}`, () => {
      const d = buildDemo(today);
      expect(d.settings.demo).toBe(true);
      expect(d.txns.length).toBeGreaterThan(150);
      expect(d.txns.every((t) => t.date <= today)).toBe(true);
      expect(new Set(d.txns.map((t) => t.id)).size).toBe(d.txns.length);
      // Survives the same checks as any imported backup, untouched.
      expect(sanitize(JSON.parse(JSON.stringify(d))).dropped).toBe(0);
      // Nothing left to post: the demo is already caught up.
      expect(catchUp(d, today).posted).toBe(0);
      expect(balance(d, 'a_savings')).toBeGreaterThan(3_000_000);
      const r = runway(d, today);
      expect(r.mode).toBe('salary');
      expect(r.target?.status).toBe('reaches');
      expect(cycleSummary(d, today).source).toBe('salary');
      expect(insights(d, today).length).toBeGreaterThan(2);
    });
  }
  it('is the same every time for a given day', () => {
    expect(buildDemo('2026-11-08')).toEqual(buildDemo('2026-11-08'));
  });
});
