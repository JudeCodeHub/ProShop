import type { OrderStatus, PaymentMethod } from '../../generated/prisma/client.js';

export interface ReceiptItem {
  name: string;
  variant: string;
  sku: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Receipt {
  receiptNumber: string;
  orderId: number;
  status: OrderStatus;
  issuedAt: string;
  store: {
    name: string;
    address: string | null;
    logoUrl: string | null;
    footer: string | null;
  };
  cashier: string;
  customer: { name: string } | null;
  items: ReceiptItem[];
  currency: string;
  subtotal: string;
  discount: string;
  taxRate: string;
  tax: string;
  total: string;
  paymentMethod: PaymentMethod;
}

export const receiptNumber = (orderId: number) =>
  `R-${String(orderId).padStart(6, '0')}`;
