import { BadRequestException } from '@nestjs/common';
import { todayInStore } from '../common/store-time.js';
import {
  addDays,
  resolveRange,
  startOfMonthsBack,
  startOfWeeksBack,
} from './report-range.js';

describe('report date helpers', () => {
  it('adds days across months and leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -29)).toBe('2025-12-03');
  });

  it('finds the Monday a number of weeks back', () => {
    expect(startOfWeeksBack('2026-09-15', 0)).toBe('2026-09-14');
    expect(startOfWeeksBack('2026-09-14', 0)).toBe('2026-09-14');
    expect(startOfWeeksBack('2026-09-20', 11)).toBe('2026-06-29');
  });

  it('finds the first day of a month a number of months back', () => {
    expect(startOfMonthsBack('2026-09-15', 11)).toBe('2025-10-01');
    expect(startOfMonthsBack('2026-03-31', 1)).toBe('2026-02-01');
  });

  it('uses today in store time (Asia/Colombo) as the default end date', () => {
    const lateEveningUtc = new Date('2026-09-15T20:00:00Z');
    expect(todayInStore(lateEveningUtc)).toBe('2026-09-16');
    expect(resolveRange({}, (to) => addDays(to, -29), lateEveningUtc)).toEqual({
      from: '2026-08-18',
      to: '2026-09-16',
    });
  });

  it('keeps explicit dates', () => {
    expect(resolveRange({ from: '2020-03-01', to: '2020-03-31' }, () => 'unused')).toEqual({
      from: '2020-03-01',
      to: '2020-03-31',
    });
  });

  it('rejects from after to and ranges longer than 10 years', () => {
    expect(() => resolveRange({ from: '2020-03-02', to: '2020-03-01' }, () => '')).toThrow(
      BadRequestException,
    );
    expect(() => resolveRange({ from: '2000-01-01', to: '2020-01-01' }, () => '')).toThrow(
      'The date range cannot be longer than 3660 days',
    );
  });
});
