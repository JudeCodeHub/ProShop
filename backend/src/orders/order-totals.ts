import { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

export interface PricedLine {
  unitPrice: Decimal;
  qty: number;
}

export interface OrderTotals {
  subtotal: Decimal;
  discount: Decimal;
  taxRate: Decimal;
  tax: Decimal;
  total: Decimal;
}

export function calculateSubtotal(lines: PricedLine[]): Decimal {
  return lines.reduce(
    (sum, line) => sum.plus(line.unitPrice.times(line.qty)),
    new Prisma.Decimal(0),
  );
}

export function calculateTotals(
  lines: PricedLine[],
  discount: Decimal,
  taxRatePercent: Decimal,
): OrderTotals {
  const subtotal = calculateSubtotal(lines);
  const taxable = subtotal.minus(discount);
  const tax = taxable
    .times(taxRatePercent)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    subtotal,
    discount,
    taxRate: taxRatePercent,
    tax,
    total: taxable.plus(tax),
  };
}
