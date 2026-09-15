import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto.js';
import { calculateSubtotal, calculateTotals } from './order-totals.js';

const orderDetails = {
  customer: { select: { id: true, name: true } },
  cashier: { select: { id: true, name: true } },
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
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderDetails }>;

function mergeQuantities(items: OrderItemDto[]): Map<number, number> {
  const quantities = new Map<number, number>();
  for (const { variantId, qty } of items) {
    quantities.set(variantId, (quantities.get(variantId) ?? 0) + qty);
  }
  return new Map([...quantities].sort(([a], [b]) => a - b));
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(cashierId: number, dto: CreateOrderDto) {
    const quantities = mergeQuantities(dto.items);
    const variantIds = [...quantities.keys()];
    const discount = new Prisma.Decimal(dto.discount ?? 0);

    return this.prisma.$transaction(async (tx) => {
      if (dto.customerId !== undefined) {
        const customer = await tx.customer.findUnique({
          where: { id: dto.customerId },
          select: { id: true },
        });
        if (!customer) {
          throw new BadRequestException(`Customer ${dto.customerId} does not exist`);
        }
      }

      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, sku: true, stockQty: true, sellPrice: true },
      });
      const byId = new Map(variants.map((v) => [v.id, v]));

      const missing = variantIds.filter((id) => !byId.has(id));
      if (missing.length) {
        throw new NotFoundException(`Variant not found: ${missing.join(', ')}`);
      }

      const lines = variantIds.map((id) => {
        const variant = byId.get(id)!;
        return { variant, qty: quantities.get(id)!, unitPrice: variant.sellPrice };
      });

      const shortages = lines
        .filter((line) => line.variant.stockQty < line.qty)
        .map((line) => ({
          variantId: line.variant.id,
          sku: line.variant.sku,
          requested: line.qty,
          available: line.variant.stockQty,
        }));
      if (shortages.length) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: `Not enough stock for ${shortages
            .map((s) => `${s.sku} (requested ${s.requested}, only ${s.available} left)`)
            .join('; ')}`,
          shortages,
        });
      }

      const subtotal = calculateSubtotal(lines);
      if (discount.gt(subtotal)) {
        throw new BadRequestException(
          `Discount ${discount.toFixed(2)} is more than the subtotal ${subtotal.toFixed(2)}`,
        );
      }

      const settings = await tx.settings.findUnique({
        where: { id: 1 },
        select: { taxRate: true },
      });
      const totals = calculateTotals(
        lines,
        discount,
        settings?.taxRate ?? new Prisma.Decimal(0),
      );

      for (const line of lines) {
        const { count } = await tx.productVariant.updateMany({
          where: { id: line.variant.id, stockQty: { gte: line.qty } },
          data: { stockQty: { decrement: line.qty } },
        });
        if (count === 0) {
          throw new ConflictException(
            `Stock for ${line.variant.sku} changed while the sale was processing. Please try again.`,
          );
        }
      }

      const order = await tx.order.create({
        data: {
          customerId: dto.customerId,
          cashierId,
          paymentMethod: dto.paymentMethod,
          status: OrderStatus.completed,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          items: {
            create: lines.map((line) => ({
              variantId: line.variant.id,
              qty: line.qty,
              priceAtSale: line.unitPrice,
            })),
          },
        },
        include: orderDetails,
      });

      return this.toResponse(order, totals.taxRate);
    });
  }

  private toResponse(order: OrderWithDetails, taxRate: Prisma.Decimal) {
    const items = order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      sku: item.variant.sku,
      productName: item.variant.product.name,
      size: item.variant.size,
      color: item.variant.color,
      qty: item.qty,
      unitPrice: item.priceAtSale.toFixed(2),
      lineTotal: item.priceAtSale.times(item.qty).toFixed(2),
    }));
    const subtotal = calculateSubtotal(
      order.items.map((item) => ({ unitPrice: item.priceAtSale, qty: item.qty })),
    );

    return {
      id: order.id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      customer: order.customer,
      cashier: order.cashier,
      items,
      subtotal: subtotal.toFixed(2),
      discount: order.discount.toFixed(2),
      taxRate: taxRate.toFixed(2),
      tax: order.tax.toFixed(2),
      total: order.total.toFixed(2),
    };
  }
}
