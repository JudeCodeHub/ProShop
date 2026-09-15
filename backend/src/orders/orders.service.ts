import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { OrderStatus, Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto.js';
import { calculateSubtotal, calculateTotals } from './order-totals.js';

type Tx = Prisma.TransactionClient;

interface StockLine {
  variantId: number;
  qty: number;
}

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

const byVariantId = (a: StockLine, b: StockLine) => a.variantId - b.variantId;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(cashierId: number, dto: CreateOrderDto) {
    return this.placeOrder(cashierId, dto, OrderStatus.completed);
  }

  hold(cashierId: number, dto: CreateOrderDto) {
    return this.placeOrder(cashierId, dto, OrderStatus.held);
  }

  async findHeld(cashierId: number) {
    const orders = await this.prisma.order.findMany({
      where: { cashierId, status: OrderStatus.held },
      include: orderDetails,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return orders.map((order) => this.toResponse(order));
  }

  resume(id: number, user: JwtPayload) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          status: true,
          cashierId: true,
          items: { select: { variantId: true, qty: true } },
        },
      });
      if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      if (user.role !== Role.admin && order.cashierId !== user.userId) {
        throw new ForbiddenException('You can only resume your own held orders');
      }

      const { count } = await tx.order.updateMany({
        where: { id, status: OrderStatus.held },
        data: { status: OrderStatus.completed, createdAt: new Date() },
      });
      if (count === 0) {
        const state = order.status === OrderStatus.held ? 'no longer held' : order.status;
        throw new ConflictException(
          `Order ${id} is ${state}; only held orders can be resumed`,
        );
      }

      await this.deductStock(tx, order.items);
      return this.toResponse(
        await tx.order.findUniqueOrThrow({ where: { id }, include: orderDetails }),
      );
    });
  }

  voidOrder(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          status: true,
          items: { select: { variantId: true, qty: true } },
          _count: { select: { returns: true } },
        },
      });
      if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      if (order.status === OrderStatus.voided) {
        throw new ConflictException(`Order ${id} is already voided`);
      }
      if (order._count.returns > 0) {
        throw new ConflictException(`Order ${id} has returns and cannot be voided`);
      }

      const { count } = await tx.order.updateMany({
        where: { id, status: order.status },
        data: { status: OrderStatus.voided },
      });
      if (count === 0) {
        throw new ConflictException(
          `Order ${id} changed while it was being voided. Please try again.`,
        );
      }

      if (order.status === OrderStatus.completed) {
        for (const line of [...order.items].sort(byVariantId)) {
          await tx.productVariant.update({
            where: { id: line.variantId },
            data: { stockQty: { increment: line.qty } },
          });
        }
      }

      return this.toResponse(
        await tx.order.findUniqueOrThrow({ where: { id }, include: orderDetails }),
      );
    });
  }

  private placeOrder(cashierId: number, dto: CreateOrderDto, status: OrderStatus) {
    return this.prisma.$transaction(async (tx) => {
      const { lines, totals } = await this.priceOrder(tx, dto);
      if (status === OrderStatus.completed) {
        await this.deductStock(tx, lines);
      }

      const order = await tx.order.create({
        data: {
          customerId: dto.customerId,
          cashierId,
          paymentMethod: dto.paymentMethod,
          status,
          discount: totals.discount,
          tax: totals.tax,
          taxRate: totals.taxRate,
          total: totals.total,
          items: {
            create: lines.map((line) => ({
              variantId: line.variantId,
              qty: line.qty,
              priceAtSale: line.unitPrice,
            })),
          },
        },
        include: orderDetails,
      });
      return this.toResponse(order);
    });
  }

  private async priceOrder(tx: Tx, dto: CreateOrderDto) {
    if (dto.customerId !== undefined) {
      const customer = await tx.customer.findUnique({
        where: { id: dto.customerId },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException(`Customer ${dto.customerId} does not exist`);
      }
    }

    const quantities = mergeQuantities(dto.items);
    const variantIds = [...quantities.keys()];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sellPrice: true },
    });
    const prices = new Map(variants.map((v) => [v.id, v.sellPrice]));

    const missing = variantIds.filter((id) => !prices.has(id));
    if (missing.length) {
      throw new NotFoundException(`Variant not found: ${missing.join(', ')}`);
    }

    const lines = variantIds.map((id) => ({
      variantId: id,
      qty: quantities.get(id)!,
      unitPrice: prices.get(id)!,
    }));

    const discount = new Prisma.Decimal(dto.discount ?? 0);
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
    return {
      lines,
      totals: calculateTotals(lines, discount, settings?.taxRate ?? new Prisma.Decimal(0)),
    };
  }

  private async deductStock(tx: Tx, lines: StockLine[]) {
    const sorted = [...lines].sort(byVariantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: sorted.map((line) => line.variantId) } },
      select: { id: true, sku: true, stockQty: true },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    const shortages = sorted.flatMap((line) => {
      const variant = byId.get(line.variantId)!;
      return variant.stockQty < line.qty
        ? [{ variantId: variant.id, sku: variant.sku, requested: line.qty, available: variant.stockQty }]
        : [];
    });
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

    for (const line of sorted) {
      const { count } = await tx.productVariant.updateMany({
        where: { id: line.variantId, stockQty: { gte: line.qty } },
        data: { stockQty: { decrement: line.qty } },
      });
      if (count === 0) {
        throw new ConflictException(
          `Stock for ${byId.get(line.variantId)!.sku} changed while the sale was processing. Please try again.`,
        );
      }
    }
  }

  private toResponse(order: OrderWithDetails) {
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
      taxRate: order.taxRate.toFixed(2),
      tax: order.tax.toFixed(2),
      total: order.total.toFixed(2),
    };
  }
}
