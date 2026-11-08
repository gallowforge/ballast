import { describe, expect, it } from 'vitest';
import {
  describeCadence,
  duePosts,
  monthlyEquivalent,
  nextDue,
  nth,
  occurrences,
  upcoming,
  yearlyEquivalent,
} from '../calc/recurring';
import { data, rec } from './fixtures';

describe('recurring schedules', () => {
  it('keeps the anchor day through short months', () => {
    expect([0, 1, 2, 3].map((i) => nth('2026-01-31', 1, 'month', i))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });
  it('steps weeks and years', () => {
    expect(nth('2026-11-08', 2, 'week', 3)).toBe('2026-12-20');
    expect(nth('2028-02-29', 1, 'year', 1)).toBe('2029-02-28');
  });
  it('lists occurrences in a window, respecting start and end', () => {
    const r = rec({ amount: 1000, startOn: '2026-01-15', endOn: '2026-05-15' });
    expect(occurrences(r, '2026-03-01', '2026-12-31')).toEqual([
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
    ]);
    expect(occurrences(r, '2025-01-01', '2025-12-31')).toEqual([]);
  });
  it('jumps ahead efficiently for old schedules', () => {
    const r = rec({ amount: 1000, startOn: '2016-01-10' });
    expect(occurrences(r, '2026-11-01', '2026-11-30')).toEqual(['2026-11-10']);
  });
  it('finds the next due date', () => {
    const r = rec({ amount: 1000, startOn: '2026-01-10' });
    expect(nextDue(r, '2026-11-08')).toBe('2026-11-10');
    expect(nextDue(r, '2026-11-10')).toBe('2026-11-10');
    expect(nextDue({ ...r, endOn: '2026-10-10' }, '2026-11-08')).toBeNull();
  });
  it.each([
    [{ amount: 12_000, every: 1, unit: 'month' as const }, 12_000, 144_000],
    [{ amount: 12_000, every: 3, unit: 'month' as const }, 4_000, 48_000],
    [{ amount: 120_000, every: 1, unit: 'year' as const }, 10_000, 120_000],
    [{ amount: 3_000, every: 1, unit: 'week' as const }, 13_000, 156_000],
    [{ amount: 3_000, every: 2, unit: 'week' as const }, 6_500, 78_000],
  ])('%o costs %i a month and %i a year', (r, month, year) => {
    expect(monthlyEquivalent(r)).toBe(month);
    expect(yearlyEquivalent(r)).toBe(year);
  });
  it('describes the cadence', () => {
    expect(describeCadence({ every: 1, unit: 'month' })).toBe('every month');
    expect(describeCadence({ every: 2, unit: 'week' })).toBe('every 2 weeks');
  });
  it('sorts everything due in a window', () => {
    const d = data({
      recurring: [
        rec({ id: 'a', amount: 5000, startOn: '2026-01-20' }),
        rec({ id: 'b', amount: 1000, startOn: '2026-01-09' }),
      ],
    });
    expect(upcoming(d, '2026-11-08', '2026-11-30').map((u) => [u.recurring.id, u.date])).toEqual([
      ['b', '2026-11-09'],
      ['a', '2026-11-20'],
    ]);
  });
  it('knows which automatic posts are due, and only those', () => {
    const r = rec({ amount: 1000, startOn: '2026-09-05', autoPost: true });
    expect(duePosts(r, '2026-11-08')).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
    expect(duePosts({ ...r, lastPostedOn: '2026-10-05' }, '2026-11-08')).toEqual(['2026-11-05']);
    expect(duePosts({ ...r, lastPostedOn: '2026-11-05' }, '2026-11-08')).toEqual([]);
    expect(duePosts({ ...r, autoPost: false }, '2026-11-08')).toEqual([]);
  });
});
