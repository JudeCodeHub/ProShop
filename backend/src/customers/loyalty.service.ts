import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

function positiveAmount(config: ConfigService, key: string, fallback: string): Decimal {
  const raw = config.get<string>(key, fallback);
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error(`${key} must be a positive number with up to 2 decimals, got "${raw}"`);
  }
  return new Prisma.Decimal(raw);
}

@Injectable()
export class LoyaltyService {
  readonly spendPerPoint: Decimal;
  readonly pointValue: Decimal;

  constructor(config: ConfigService) {
    this.spendPerPoint = positiveAmount(config, 'LOYALTY_SPEND_PER_POINT', '100');
    this.pointValue = positiveAmount(config, 'LOYALTY_POINT_VALUE', '1');
  }

  pointsEarnedFor(total: Decimal): number {
    return total.lte(0) ? 0 : total.dividedToIntegerBy(this.spendPerPoint).toNumber();
  }

  discountFor(points: number): Decimal {
    return this.pointValue.times(points).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
}
