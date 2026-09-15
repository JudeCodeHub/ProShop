import { Prisma } from '../generated/prisma/client.js';
import { paidForUnits, paidRatio, refundForUnits } from './refund-calculator.js';

const d = (value: string | number) => new Prisma.Decimal(value);

describe('refund calculator', () => {
  it('refunds the list price when the order had no discount or tax', () => {
    const ratio = paidRatio([{ priceAtSale: d('19.99'), qty: 3 }], d('59.97'));
    expect(ratio.toString()).toBe('1');
    expect(refundForUnits(d('19.99'), ratio, 0, 2).toFixed(2)).toBe('39.98');
  });

  it('refunds what was actually paid after the order discount and tax', () => {
    const ratio = paidRatio(
      [
        { priceAtSale: d('100'), qty: 3 },
        { priceAtSale: d('150'), qty: 1 },
      ],
      d('465.75'),
    );
    expect(ratio.toString()).toBe('1.035');
    expect(refundForUnits(d('100'), ratio, 0, 1).toFixed(2)).toBe('103.50');
    expect(refundForUnits(d('150'), ratio, 0, 1).toFixed(2)).toBe('155.25');
  });

  it('adds up exactly when a line is returned in several parts', () => {
    const ratio = paidRatio([{ priceAtSale: d('33.33'), qty: 7 }], d('201.01'));
    const whole = paidForUnits(d('33.33'), ratio, 7);
    const parts = [2, 1, 3, 1].reduce(
      (acc, units) => ({
        returned: acc.returned + units,
        total: acc.total.plus(refundForUnits(d('33.33'), ratio, acc.returned, units)),
      }),
      { returned: 0, total: d(0) },
    );
    expect(parts.total.toFixed(2)).toBe(whole.toFixed(2));
  });

  it('refunds nothing for free items', () => {
    const ratio = paidRatio([{ priceAtSale: d('0'), qty: 2 }], d('0'));
    expect(refundForUnits(d('0'), ratio, 0, 2).toFixed(2)).toBe('0.00');
  });
});
