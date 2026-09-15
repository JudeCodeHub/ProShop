import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';
import { LoyaltyService } from './loyalty.service.js';
import { normalizePhone } from './phone.js';

const make = (env: Record<string, string> = {}) => new LoyaltyService(new ConfigService(env));
const d = (value: string) => new Prisma.Decimal(value);

describe('LoyaltyService', () => {
  it('defaults to 1 point per 100 spent, worth 1 each', () => {
    const loyalty = make();
    expect(loyalty.pointsEarnedFor(d('99.99'))).toBe(0);
    expect(loyalty.pointsEarnedFor(d('100'))).toBe(1);
    expect(loyalty.pointsEarnedFor(d('465.75'))).toBe(4);
    expect(loyalty.pointsEarnedFor(d('0'))).toBe(0);
    expect(loyalty.discountFor(150).toFixed(2)).toBe('150.00');
  });

  it('uses the configured rates', () => {
    const loyalty = make({ LOYALTY_SPEND_PER_POINT: '250', LOYALTY_POINT_VALUE: '0.5' });
    expect(loyalty.pointsEarnedFor(d('1000'))).toBe(4);
    expect(loyalty.discountFor(3).toFixed(2)).toBe('1.50');
  });

  it.each(['0', '-1', 'abc', '1.234', ''])('refuses to start with LOYALTY_SPEND_PER_POINT=%j', (value) => {
    expect(() => make({ LOYALTY_SPEND_PER_POINT: value })).toThrow('LOYALTY_SPEND_PER_POINT must be a positive number');
  });
});

describe('normalizePhone', () => {
  it('keeps digits and a leading plus so the same number always matches', () => {
    expect(normalizePhone(' 077 123-4567 ')).toBe('0771234567');
    expect(normalizePhone('+94 (77) 123 4567')).toBe('+94771234567');
    expect(normalizePhone('0771234567')).toBe('0771234567');
  });

  it('leaves text with letters unchanged so validation can reject it', () => {
    expect(normalizePhone('call me')).toBe('call me');
    expect(normalizePhone('   ')).toBe('');
  });
});
