import { describe, expect, it } from 'vitest';
import { HEAT, heatLevel } from '@/components/charts/Heatmap';

describe('heatmap shades', () => {
  it('spreads days over four shades by the square root of their share', () => {
    expect(heatLevel(1, 100)).toBe(0); // 0.1
    expect(heatLevel(9, 100)).toBe(1); // 0.3
    expect(heatLevel(36, 100)).toBe(2); // 0.6
    expect(heatLevel(100, 100)).toBe(3);
    expect(heatLevel(250, 100)).toBe(3);
  });

  it('never picks a shade from the unreadable middle of the range', () => {
    for (const h of HEAT) expect(h.mix <= 38 || h.mix >= 66).toBe(true);
    for (let v = 1; v <= 100; v++) expect(HEAT[heatLevel(v, 100)]).toBeDefined();
  });
});
