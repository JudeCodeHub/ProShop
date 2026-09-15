import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { calculateSubtotal } from '../order-totals.js';
import { renderReceiptPdf } from './receipt-pdf.js';
import { receiptNumber, type Receipt } from './receipt.js';

const DEFAULT_STORE_NAME = 'ProShop';
const DEFAULT_CURRENCY = 'LKR';

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReceipt(orderId: number): Promise<Receipt> {
    const [order, settings] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { name: true } },
          cashier: { select: { name: true } },
          items: {
            orderBy: { id: 'asc' },
            include: {
              variant: {
                select: {
                  sku: true,
                  size: true,
                  color: true,
                  product: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.settings.findUnique({ where: { id: 1 } }),
    ]);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const subtotal = calculateSubtotal(
      order.items.map((item) => ({ unitPrice: item.priceAtSale, qty: item.qty })),
    );

    return {
      receiptNumber: receiptNumber(order.id),
      orderId: order.id,
      status: order.status,
      issuedAt: order.createdAt.toISOString(),
      store: {
        name: settings?.storeName ?? DEFAULT_STORE_NAME,
        address: settings?.address ?? null,
        logoUrl: settings?.logoUrl ?? null,
        footer: settings?.receiptFooterText ?? null,
      },
      cashier: order.cashier.name,
      customer: order.customer,
      items: order.items.map((item) => ({
        name: item.variant.product.name,
        variant: `${item.variant.size} / ${item.variant.color}`,
        sku: item.variant.sku,
        qty: item.qty,
        unitPrice: item.priceAtSale.toFixed(2),
        lineTotal: item.priceAtSale.times(item.qty).toFixed(2),
      })),
      currency: settings?.currency ?? DEFAULT_CURRENCY,
      subtotal: subtotal.toFixed(2),
      discount: order.discount.toFixed(2),
      taxRate: order.taxRate.toFixed(2),
      tax: order.tax.toFixed(2),
      total: order.total.toFixed(2),
      paymentMethod: order.paymentMethod,
    };
  }

  async getPdf(orderId: number) {
    const receipt = await this.getReceipt(orderId);
    return { receipt, pdf: await renderReceiptPdf(receipt) };
  }
}
