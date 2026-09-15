import { storeDayStartUtc, todayInStore } from './store-time.js';

describe('store time', () => {
  it('finds when a store day starts in UTC (Asia/Colombo is UTC+05:30)', () => {
    expect(storeDayStartUtc('2026-09-15').toISOString()).toBe('2026-09-14T18:30:00.000Z');
    expect(storeDayStartUtc('2020-03-01').toISOString()).toBe('2020-02-29T18:30:00.000Z');
  });

  it('gives today in store time', () => {
    expect(todayInStore(new Date('2026-09-15T19:00:00Z'))).toBe('2026-09-16');
    expect(todayInStore(new Date('2026-09-15T18:29:00Z'))).toBe('2026-09-15');
  });
});
