import { BadRequestException } from '@nestjs/common';
import { todayInStore } from '../common/store-time.js';

export interface DateRange {
  from: string;
  to: string;
}

export const MAX_RANGE_DAYS = 3660;
const DAY_MS = 86_400_000;

const parse = (date: string) => new Date(`${date}T00:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

export function startOfWeeksBack(date: string, weeks: number): string {
  const mondayOffset = (parse(date).getUTCDay() + 6) % 7;
  return addDays(date, -mondayOffset - weeks * 7);
}

export function startOfMonthsBack(date: string, months: number): string {
  const d = parse(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  return format(d);
}

export function resolveRange(
  query: { from?: string; to?: string },
  defaultFrom: (to: string) => string,
  now?: Date,
): DateRange {
  const to = query.to ?? todayInStore(now);
  const from = query.from ?? defaultFrom(to);

  if (from > to) {
    throw new BadRequestException('from must be on or before to');
  }
  if ((parse(to).getTime() - parse(from).getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new BadRequestException(
      `The date range cannot be longer than ${MAX_RANGE_DAYS} days`,
    );
  }
  return { from, to };
}
