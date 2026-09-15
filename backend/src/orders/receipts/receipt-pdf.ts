import PDFDocument from 'pdfkit';
import type { Receipt } from './receipt.js';

const PAGE_WIDTH = 226;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const STORE_TIME_ZONE = 'Asia/Colombo';

const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: STORE_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const formatMoney = (value: string, currency: string) =>
  `${currency} ${moneyFormat.format(Number(value))}`;

export const formatReceiptDate = (iso: string) => dateFormat.format(new Date(iso));

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function estimateHeight(receipt: Receipt): number {
  return (
    230 +
    receipt.items.length * 28 +
    (receipt.store.address ? 14 : 0) +
    (receipt.store.footer ? 40 : 0) +
    (receipt.customer ? 12 : 0) +
    (receipt.status === 'completed' ? 0 : 20) +
    (Number(receipt.discount) > 0 ? 12 : 0)
  );
}

export function renderReceiptPdf(receipt: Receipt): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, estimateHeight(receipt)],
    margin: MARGIN,
    info: { Title: `Receipt ${receipt.receiptNumber}` },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const money = (value: string) => formatMoney(value, receipt.currency);

  const row = (left: string, right: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(left, MARGIN, y, { width: CONTENT_WIDTH * 0.55 });
    const leftBottom = doc.y;
    doc.text(right, MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });
    doc.y = Math.max(leftBottom, doc.y);
  };

  const divider = () => {
    doc.moveDown(0.4);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(PAGE_WIDTH - MARGIN, doc.y)
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.4);
  };

  doc.font('Helvetica-Bold').fontSize(12).text(receipt.store.name, { align: 'center' });
  doc.font('Helvetica').fontSize(8);
  if (receipt.store.address) {
    doc.text(receipt.store.address, { align: 'center' });
  }
  if (receipt.status !== 'completed') {
    doc
      .moveDown(0.4)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`*** ${receipt.status.toUpperCase()} ***`, { align: 'center' })
      .fontSize(8);
  }

  doc.moveDown(0.6);
  row('Receipt', receipt.receiptNumber);
  row('Date', formatReceiptDate(receipt.issuedAt));
  row('Cashier', receipt.cashier);
  if (receipt.customer) {
    row('Customer', receipt.customer.name);
  }

  divider();
  for (const item of receipt.items) {
    doc
      .font('Helvetica-Bold')
      .text(`${item.name} (${item.variant})`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    row(`  ${item.qty} x ${money(item.unitPrice)}`, money(item.lineTotal));
  }

  divider();
  row('Subtotal', money(receipt.subtotal));
  if (Number(receipt.discount) > 0) {
    row('Discount', `-${money(receipt.discount)}`);
  }
  row(`Tax (${Number(receipt.taxRate)}%)`, money(receipt.tax));
  doc.moveDown(0.2);
  row('TOTAL', money(receipt.total), true);
  row('Paid by', capitalize(receipt.paymentMethod));

  if (receipt.store.footer) {
    doc
      .moveDown(1)
      .font('Helvetica')
      .text(receipt.store.footer, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  }

  doc.end();
  return finished;
}
