import { formatMoney, formatReceiptDate, renderReceiptPdf } from './receipt-pdf.js';
import { receiptNumber, type Receipt } from './receipt.js';

const receipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  receiptNumber: receiptNumber(42),
  orderId: 42,
  status: 'completed',
  issuedAt: '2026-09-15T06:30:00.000Z',
  store: { name: 'ProShop Colombo', address: '12 Galle Road', logoUrl: null, footer: 'Thank you!' },
  cashier: 'Nimal',
  customer: { name: 'Kamal' },
  items: [
    { name: 'Pro Runner', variant: '42 / Black', sku: 'PROD-1-42-BLACK', qty: 3, unitPrice: '19.99', lineTotal: '59.97' },
  ],
  currency: 'LKR',
  subtotal: '59.97',
  discount: '5.00',
  taxRate: '15.00',
  tax: '8.25',
  total: '63.22',
  paymentMethod: 'cash',
  ...overrides,
});

const isPdf = (buffer: Buffer) =>
  buffer.subarray(0, 5).toString() === '%PDF-' &&
  buffer.subarray(-6).toString().includes('%%EOF');

describe('receipt formatting', () => {
  it('pads the receipt number', () => {
    expect(receiptNumber(42)).toBe('R-000042');
    expect(receiptNumber(1234567)).toBe('R-1234567');
  });

  it('formats money with thousands separators and the currency', () => {
    expect(formatMoney('1234.5', 'LKR')).toBe('LKR 1,234.50');
    expect(formatMoney('0', 'LKR')).toBe('LKR 0.00');
  });

  it('shows the date in store time (Asia/Colombo)', () => {
    const text = formatReceiptDate('2026-09-15T06:30:00.000Z');
    expect(text).toContain('2026');
    expect(text).toContain('12:00');
  });
});

describe('renderReceiptPdf', () => {
  it('produces a complete PDF', async () => {
    expect(isPdf(await renderReceiptPdf(receipt()))).toBe(true);
  });

  it('handles a voided order with no customer, address, footer or discount', async () => {
    const pdf = await renderReceiptPdf(
      receipt({
        status: 'voided',
        customer: null,
        discount: '0.00',
        store: { name: 'ProShop', address: null, logoUrl: null, footer: null },
      }),
    );
    expect(isPdf(pdf)).toBe(true);
  });

  it('handles many items with long names', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      name: `Very long product name number ${i} that needs to wrap onto a second line`,
      variant: 'XL / Navy Blue',
      sku: `SKU-${i}`,
      qty: 1,
      unitPrice: '1000.00',
      lineTotal: '1000.00',
    }));
    expect(isPdf(await renderReceiptPdf(receipt({ items })))).toBe(true);
  });
});
