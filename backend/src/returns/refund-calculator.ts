import { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

const round2 = (value: Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function paidRatio(
  items: { priceAtSale: Decimal; qty: number }[],
  orderTotal: Decimal,
): Decimal {
  const subtotal = items.reduce(
    (sum, item) => sum.plus(item.priceAtSale.times(item.qty)),
    new Prisma.Decimal(0),
  );
  return subtotal.isZero() ? new Prisma.Decimal(0) : orderTotal.dividedBy(subtotal);
}

export function paidForUnits(unitPrice: Decimal, ratio: Decimal, units: number): Decimal {
  return round2(unitPrice.times(units).times(ratio));
}

export function refundForUnits(
  unitPrice: Decimal,
  ratio: Decimal,
  alreadyReturned: number,
  units: number,
): Decimal {
  return paidForUnits(unitPrice, ratio, alreadyReturned + units).minus(
    paidForUnits(unitPrice, ratio, alreadyReturned),
  );
}
