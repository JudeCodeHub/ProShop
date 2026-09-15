import { Prisma } from '../generated/prisma/client.js';
import { calculateTotals } from './order-totals.js';

const d = (value: string | number) => new Prisma.Decimal(value);
const asStrings = (totals: ReturnType<typeof calculateTotals>) =>
  Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(2)]));

describe('calculateTotals', () => {
  it('adds line totals exactly, without float drift', () => {
    const totals = calculateTotals([{ unitPrice: d('19.99'), qty: 3 }], d(0), d(0));
    expect(totals.subtotal.toFixed(2)).toBe('59.97');
    expect(totals.total.toFixed(2)).toBe('59.97');
  });

  it('takes the discount off before calculating tax', () => {
    const totals = calculateTotals(
      [
        { unitPrice: d('19.99'), qty: 3 },
        { unitPrice: d('150'), qty: 1 },
      ],
      d('10'),
      d('15'),
    );
    expect(asStrings(totals)).toEqual({
      subtotal: '209.97',
      discount: '10.00',
      taxRate: '15.00',
      tax: '30.00',
      total: '229.97',
    });
  });

  it('rounds tax half-up to 2 decimals', () => {
    expect(calculateTotals([{ unitPrice: d('10.05'), qty: 1 }], d(0), d('15')).tax.toFixed(2)).toBe('1.51');
    expect(calculateTotals([{ unitPrice: d('0.10'), qty: 1 }], d(0), d('15')).tax.toFixed(2)).toBe('0.02');
  });

  it('charges no tax when the rate is 0', () => {
    const totals = calculateTotals([{ unitPrice: d('99.99'), qty: 2 }], d('0.98'), d(0));
    expect(totals.tax.toFixed(2)).toBe('0.00');
    expect(totals.total.toFixed(2)).toBe('199.00');
  });
});
