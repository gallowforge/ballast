import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  cycleAt,
  cycleOf,
  dayHeading,
  daysInMonth,
  diffDays,
  eachDay,
  formatDay,
  formatIn,
  formatLong,
  formatMonth,
  formatRelative,
  formatShort,
  formatSpan,
  isISODate,
  monthsBetween,
  ordinal,
  plural,
  today,
  weekday,
} from '../dates';

describe('date arithmetic', () => {
  it('validates ISO dates, including leap days', () => {
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2027-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('26-1-1')).toBe(false);
    expect(isISODate(20260101)).toBe(false);
  });
  it('reads today from the local clock', () => {
    expect(today(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08');
  });
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
  ])('%s + %i day → %s', (d, n, out) => expect(addDays(d, n)).toBe(out));
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-11-08', 14, '2028-01-08'],
    ['2026-01-15', -13, '2024-12-15'],
  ])('%s + %i months → %s', (d, n, out) => expect(addMonths(d, n)).toBe(out));
  it('counts days across a daylight-saving change', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-11-08', '2026-11-01')).toBe(-7);
  });
  it('knows weekdays and month lengths', () => {
    expect(weekday('2026-11-08')).toBe(0);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });
  it.each([
    ['2026-01-15', '2026-03-15', 2],
    ['2026-01-15', '2026-03-14', 1],
    ['2026-01-31', '2026-02-28', 1],
    ['2026-11-08', '2028-07-01', 19],
  ])('months between %s and %s = %i', (a, b, n) => expect(monthsBetween(a, b)).toBe(n));
});

describe('money months (cycles)', () => {
  it('runs from the payday to the day before the next one', () => {
    expect(cycleOf('2026-11-08', 25)).toEqual({ start: '2026-10-25', end: '2026-11-24', days: 31 });
    expect(cycleOf('2026-11-25', 25)).toEqual({ start: '2026-11-25', end: '2026-12-24', days: 30 });
  });
  it('is the calendar month when the payday is the 1st', () => {
    expect(cycleOf('2026-02-14', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28', days: 28 });
  });
  it('clamps silly paydays into 1 to 28', () => {
    expect(cycleOf('2026-02-10', 31).start).toBe('2026-01-28');
    expect(cycleOf('2026-02-10', 0).start).toBe('2026-02-01');
  });
  it('steps to earlier and later cycles', () => {
    expect(cycleAt('2026-11-08', 1, -1)).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
      days: 31,
    });
    expect(cycleAt('2026-01-08', 1, -1).start).toBe('2025-12-01');
    expect(cycleAt('2026-11-08', 15, 2).start).toBe('2026-12-15');
  });
});

describe('English display', () => {
  it('formats in day-month order', () => {
    expect(formatShort('2026-11-08', '2026-11-08')).toBe('8 Nov');
    expect(formatShort('2025-11-08', '2026-11-08')).toBe('8 Nov 2025');
    expect(formatLong('2026-11-08')).toBe('8 November 2026');
    expect(formatDay('2026-11-08')).toBe('Sun 8 Nov');
    expect(formatMonth('2026-11-08')).toBe('November 2026');
  });
  it.each([
    ['2026-11-08', 'Today'],
    ['2026-11-07', 'Yesterday'],
    ['2026-11-09', 'Tomorrow'],
    ['2026-11-04', 'Wednesday'],
    ['2026-10-30', '30 Oct'],
  ])('%s relative to 8 Nov → %s', (d, out) => expect(formatRelative(d, '2026-11-08')).toBe(out));
  it.each([
    ['2026-11-08', 'Today', '8 Nov'],
    ['2026-11-07', 'Yesterday', '7 Nov'],
    ['2026-11-09', 'Tomorrow', '9 Nov'],
    ['2026-11-04', 'Wednesday', '4 Nov'],
    ['2026-10-30', 'Friday', '30 Oct'],
    ['2025-12-31', 'Wednesday', '31 Dec 2025'],
  ])('a list heading for %s reads %s %s', (d, name, date) =>
    expect(dayHeading(d, '2026-11-08')).toEqual({ name, date }),
  );
  it.each([
    ['2026-11-08', 'today'],
    ['2026-11-09', 'tomorrow'],
    ['2026-11-07', 'yesterday'],
    ['2026-11-12', 'in 4 days'],
    ['2026-11-01', '7 days ago'],
  ])('%s from 8 Nov reads %s', (d, out) => expect(formatIn(d, '2026-11-08')).toBe(out));
  it.each([
    ['2026-11-08', '2028-03-08', '1 year, 4 months'],
    ['2026-11-08', '2027-11-08', '1 year'],
    ['2026-11-08', '2027-06-09', '7 months'],
    ['2026-11-08', '2026-11-30', '3 weeks'],
    ['2026-11-08', '2026-11-09', '1 day'],
    ['2026-11-08', '2026-11-01', '0 days'],
  ])('span %s → %s is %s', (a, b, out) => expect(formatSpan(a, b)).toBe(out));
  it('pluralises and writes ordinals', () => {
    expect(plural(1, 'month')).toBe('1 month');
    expect(plural(1200, 'row')).toBe('1,200 rows');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 25].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '25th',
    ]);
  });
});
