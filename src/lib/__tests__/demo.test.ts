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
  it('is someone living on savings, in dollars, with a euro wallet', () => {
    const d = buildDemo('2026-11-08');
    expect(d.settings).toMatchObject({ base: 'USD', name: 'Alex' });
    expect(d.accounts.map((a) => a.currency)).toEqual(['USD', 'USD', 'EUR']);
    expect(d.rates.EUR).toBeDefined();
    expect(d.target?.label).toBe('Back to work');
    // Rent is the biggest bill, as for most people living on savings.
    const rent = d.recurring.find((r) => r.categoryId === 'home')!;
    expect(rent.amount).toBe(
      Math.max(...d.recurring.filter((r) => r.kind === 'expense').map((r) => r.amount)),
    );
    // Purchases abroad keep what they cost in euros next to what the bank charged.
    expect(d.txns.some((t) => t.original?.currency === 'EUR')).toBe(true);
    // Every category it uses exists, and it keeps the fern alive.
    const ids = new Set(d.categories.map((c) => c.id));
    expect(d.txns.every((t) => !t.categoryId || ids.has(t.categoryId))).toBe(true);
    expect(d.recurring.some((r) => r.name === "Fern's plant food")).toBe(true);
  });
  it('is the same every time for a given day', () => {
    expect(buildDemo('2026-11-08')).toEqual(buildDemo('2026-11-08'));
  });
});
