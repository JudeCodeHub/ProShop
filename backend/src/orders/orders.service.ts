import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { storeDayStartUtc } from '../common/store-time.js';
import { LoyaltyService } from '../customers/loyalty.service.js';
import { OrderStatus, Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays } from '../reports/report-range.js';
import { SettingsService } from '../settings/settings.service.js';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
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
          productId: true,
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
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly loyalty: LoyaltyService,
  ) {}

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

  async findAll(query: ListOrdersQueryDto) {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from must be on or before to');
    }

    const where: Prisma.OrderWhereInput = {
      status: query.status,
      cashierId: query.cashierId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? storeDayStartUtc(query.from) : undefined,
              lt: query.to ? storeDayStartUtc(addDays(query.to, 1)) : undefined,
            }
          : undefined,
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          cashier: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          items: { select: { qty: true } },
          _count: { select: { returns: true } },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        paymentMethod: order.paymentMethod,
        cashier: order.cashier,
        customer: order.customer,
        itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
        total: order.total.toFixed(2),
        returnCount: order._count.returns,
      })),
    };
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...orderDetails,
        returns: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            processedBy: { select: { id: true, name: true } },
            exchangeVariant: { select: { sku: true, size: true, color: true } },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const returnedQty = new Map<number, number>();
    for (const record of order.returns) {
      returnedQty.set(record.variantId, (returnedQty.get(record.variantId) ?? 0) + record.qty);
    }

    const base = this.toResponse(order);
    return {
      ...base,
      items: base.items.map((item) => ({
        ...item,
        returnedQty: returnedQty.get(item.variantId) ?? 0,
      })),
      returns: order.returns.map((record) => ({
        id: record.id,
        type: record.type,
        variantId: record.variantId,
        qty: record.qty,
        reason: record.reason,
        refundAmount: record.refundAmount.toFixed(2),
        amountDue: record.amountDue.toFixed(2),
        createdAt: record.createdAt,
        processedBy: record.processedBy,
        exchangeItem: record.exchangeVariant,
      })),
    };
  }

  resume(id: number, user: JwtPayload) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          status: true,
          cashierId: true,
          customerId: true,
          total: true,
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

      if (order.customerId !== null) {
        const earned = this.loyalty.pointsEarnedFor(order.total);
        if (earned > 0) {
          await tx.order.update({ where: { id }, data: { pointsEarned: earned } });
          await tx.customer.update({
            where: { id: order.customerId },
            data: { loyaltyPoints: { increment: earned } },
          });
        }
      }

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
          customerId: true,
          pointsEarned: true,
          pointsRedeemed: true,
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

        const pointsChange = order.pointsRedeemed - order.pointsEarned;
        if (order.customerId !== null && pointsChange !== 0) {
          await tx.$executeRaw`UPDATE "Customer" SET "loyaltyPoints" = GREATEST(0, "loyaltyPoints" + ${pointsChange}) WHERE id = ${order.customerId}`;
        }
      }

      return this.toResponse(
        await tx.order.findUniqueOrThrow({ where: { id }, include: orderDetails }),
      );
    });
  }

  private placeOrder(cashierId: number, dto: CreateOrderDto, status: OrderStatus) {
    return this.prisma.$transaction(async (tx) => {
      const completed = status === OrderStatus.completed;
      if (!completed && dto.redeemPoints !== undefined) {
        throw new BadRequestException('Loyalty points can only be redeemed when completing a sale');
      }

      const { lines, totals } = await this.priceOrder(tx, dto);
      if (completed) {
        await this.deductStock(tx, lines);
      }

      if (completed && dto.redeemPoints !== undefined) {
        const { count } = await tx.customer.updateMany({
          where: { id: dto.customerId, loyaltyPoints: { gte: dto.redeemPoints } },
          data: { loyaltyPoints: { decrement: dto.redeemPoints } },
        });
        if (count === 0) {
          throw new ConflictException(
            `Customer ${dto.customerId} no longer has ${plural(dto.redeemPoints, 'loyalty point')}. Please try again.`,
          );
        }
      }

      const pointsEarned =
        completed && dto.customerId !== undefined ? this.loyalty.pointsEarnedFor(totals.total) : 0;

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
          pointsEarned,
          pointsRedeemed: dto.redeemPoints ?? 0,
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

      if (pointsEarned > 0) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { loyaltyPoints: { increment: pointsEarned } },
        });
      }

      return this.toResponse(order);
    });
  }

  private async priceOrder(tx: Tx, dto: CreateOrderDto) {
    if (dto.redeemPoints !== undefined && dto.customerId === undefined) {
      throw new BadRequestException('Choose a customer to redeem loyalty points');
    }

    if (dto.customerId !== undefined) {
      const customer = await tx.customer.findUnique({
        where: { id: dto.customerId },
        select: { id: true, loyaltyPoints: true },
      });
      if (!customer) {
        throw new BadRequestException(`Customer ${dto.customerId} does not exist`);
      }
      if (dto.redeemPoints !== undefined && dto.redeemPoints > customer.loyaltyPoints) {
        throw new ConflictException(
          `Customer ${dto.customerId} has only ${plural(customer.loyaltyPoints, 'loyalty point')}`,
        );
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

    const pointsDiscount = dto.redeemPoints
      ? this.loyalty.discountFor(dto.redeemPoints)
      : new Prisma.Decimal(0);
    const discount = new Prisma.Decimal(dto.discount ?? 0).plus(pointsDiscount);
    const subtotal = calculateSubtotal(lines);
    if (discount.gt(subtotal)) {
      throw new BadRequestException(
        pointsDiscount.gt(0)
          ? `Discount ${discount.toFixed(2)} (including ${pointsDiscount.toFixed(2)} from loyalty points) is more than the subtotal ${subtotal.toFixed(2)}`
          : `Discount ${discount.toFixed(2)} is more than the subtotal ${subtotal.toFixed(2)}`,
      );
    }

    const { taxRate } = await this.settings.get(tx);
    return { lines, totals: calculateTotals(lines, discount, taxRate) };
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
      productId: item.variant.productId,
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
      pointsEarned: order.pointsEarned,
      pointsRedeemed: order.pointsRedeemed,
    };
  }
}
