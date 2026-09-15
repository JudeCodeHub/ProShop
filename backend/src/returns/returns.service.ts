import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, ReturnType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateExchangeDto } from './dto/create-exchange.dto.js';
import { CreateReturnDto, ReturnItemDto } from './dto/create-return.dto.js';
import { ListReturnsQueryDto } from './dto/list-returns-query.dto.js';
import { paidForUnits, paidRatio, refundForUnits } from './refund-calculator.js';

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;

const ZERO = new Prisma.Decimal(0);

const variantSelect = {
  id: true,
  sku: true,
  size: true,
  color: true,
  sellPrice: true,
  stockQty: true,
  product: { select: { name: true } },
} satisfies Prisma.ProductVariantSelect;

type VariantSummary = Prisma.ProductVariantGetPayload<{ select: typeof variantSelect }>;

const returnDetails = {
  processedBy: { select: { id: true, name: true } },
  variant: { select: variantSelect },
  exchangeVariant: { select: variantSelect },
  order: { select: { items: { select: { variantId: true, priceAtSale: true } } } },
} satisfies Prisma.ReturnInclude;

type ReturnWithDetails = Prisma.ReturnGetPayload<{ include: typeof returnDetails }>;

const describeItem = (variant: VariantSummary, unitPrice: Decimal) => ({
  variantId: variant.id,
  sku: variant.sku,
  productName: variant.product.name,
  size: variant.size,
  color: variant.color,
  unitPrice: unitPrice.toFixed(2),
});

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListReturnsQueryDto) {
    const rows = await this.prisma.return.findMany({
      where: { orderId: query.orderId },
      include: returnDetails,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? 50,
    });
    return rows.map((row) => this.toResponse(row));
  }

  previewReturn(dto: ReturnItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.quoteReturn(tx, dto.orderId, dto.variantId, dto.qty);
      return {
        orderId: dto.orderId,
        qty: dto.qty,
        item: describeItem(quote.line.variant, quote.line.priceAtSale),
        purchasedQty: quote.line.qty,
        alreadyReturned: quote.alreadyReturned,
        refundAmount: quote.credit.toFixed(2),
      };
    });
  }

  createReturn(dto: CreateReturnDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, dto.orderId);
      const quote = await this.quoteReturn(tx, dto.orderId, dto.variantId, dto.qty);

      const record = await tx.return.create({
        data: {
          type: ReturnType.return,
          orderId: dto.orderId,
          variantId: dto.variantId,
          qty: dto.qty,
          reason: dto.reason,
          refundAmount: quote.credit,
          processedById: userId,
        },
        include: returnDetails,
      });

      await tx.productVariant.update({
        where: { id: dto.variantId },
        data: { stockQty: { increment: dto.qty } },
      });
      await tx.stockAdjustment.create({
        data: {
          variantId: dto.variantId,
          userId,
          qtyChange: dto.qty,
          reason: `Return on order #${dto.orderId}`,
        },
      });

      return this.toResponse(record);
    });
  }

  previewExchange(dto: CreateExchangeDto) {
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.quoteExchange(tx, dto);
      return {
        orderId: dto.orderId,
        qty: dto.qty,
        item: describeItem(quote.line.variant, quote.line.priceAtSale),
        exchangeItem: describeItem(quote.newVariant, quote.newVariant.sellPrice),
        purchasedQty: quote.line.qty,
        alreadyReturned: quote.alreadyReturned,
        credit: quote.credit.toFixed(2),
        newItemsCost: quote.newCost.toFixed(2),
        refundAmount: quote.refund.toFixed(2),
        amountDue: quote.due.toFixed(2),
      };
    });
  }

  createExchange(dto: CreateExchangeDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, dto.orderId);
      const quote = await this.quoteExchange(tx, dto);
      const reason = `Exchange on order #${dto.orderId}`;

      const record = await tx.return.create({
        data: {
          type: ReturnType.exchange,
          orderId: dto.orderId,
          variantId: dto.originalVariantId,
          exchangeVariantId: dto.newVariantId,
          exchangeUnitPrice: quote.newVariant.sellPrice,
          qty: dto.qty,
          reason: dto.reason ?? `Exchanged for ${quote.newVariant.sku}`,
          refundAmount: quote.refund,
          amountDue: quote.due,
          processedById: userId,
        },
        include: returnDetails,
      });

      const moves = [
        { variantId: dto.originalVariantId, change: dto.qty },
        { variantId: dto.newVariantId, change: -dto.qty },
      ].sort((a, b) => a.variantId - b.variantId);

      for (const move of moves) {
        if (move.change > 0) {
          await tx.productVariant.update({
            where: { id: move.variantId },
            data: { stockQty: { increment: move.change } },
          });
          continue;
        }
        const { count } = await tx.productVariant.updateMany({
          where: { id: move.variantId, stockQty: { gte: dto.qty } },
          data: { stockQty: { decrement: dto.qty } },
        });
        if (count === 0) {
          throw new ConflictException(
            `Stock for ${quote.newVariant.sku} changed while the exchange was processing. Please try again.`,
          );
        }
      }

      await tx.stockAdjustment.createMany({
        data: [
          { variantId: dto.originalVariantId, userId, qtyChange: dto.qty, reason },
          { variantId: dto.newVariantId, userId, qtyChange: -dto.qty, reason },
        ],
      });

      return this.toResponse(record);
    });
  }

  private async lockOrder(tx: Tx, orderId: number) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  }

  private async quoteReturn(tx: Tx, orderId: number, variantId: number, qty: number) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        total: true,
        items: {
          select: { variantId: true, qty: true, priceAtSale: true, variant: { select: variantSelect } },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.status !== OrderStatus.completed) {
      throw new ConflictException(
        `Order ${orderId} is ${order.status}; only completed orders can have returns or exchanges`,
      );
    }

    const line = order.items.find((item) => item.variantId === variantId);
    if (!line) {
      throw new BadRequestException(`Variant ${variantId} is not part of order ${orderId}`);
    }

    const { _sum } = await tx.return.aggregate({
      where: { orderId, variantId },
      _sum: { qty: true },
    });
    const alreadyReturned = _sum.qty ?? 0;
    const returnable = line.qty - alreadyReturned;
    if (qty > returnable) {
      throw new ConflictException(
        returnable === 0
          ? `All ${line.qty} of ${line.variant.sku} on order ${orderId} have already been returned`
          : `Only ${returnable} of ${line.variant.sku} on order ${orderId} can still be returned`,
      );
    }

    const ratio = paidRatio(order.items, order.total);
    return {
      line,
      alreadyReturned,
      ratio,
      credit: refundForUnits(line.priceAtSale, ratio, alreadyReturned, qty),
    };
  }

  private async quoteExchange(tx: Tx, dto: CreateExchangeDto) {
    if (dto.originalVariantId === dto.newVariantId) {
      throw new BadRequestException('Choose a different size or color to exchange for');
    }

    const base = await this.quoteReturn(tx, dto.orderId, dto.originalVariantId, dto.qty);

    const newVariant = await tx.productVariant.findUnique({
      where: { id: dto.newVariantId },
      select: variantSelect,
    });
    if (!newVariant) {
      throw new NotFoundException(`Variant ${dto.newVariantId} not found`);
    }
    if (newVariant.stockQty < dto.qty) {
      throw new ConflictException(
        `Not enough stock for ${newVariant.sku}: requested ${dto.qty}, only ${newVariant.stockQty} left`,
      );
    }

    const newCost = paidForUnits(newVariant.sellPrice, base.ratio, dto.qty);
    const difference = newCost.minus(base.credit);

    return {
      ...base,
      newVariant,
      newCost,
      refund: difference.lt(0) ? difference.negated() : ZERO,
      due: difference.gt(0) ? difference : ZERO,
    };
  }

  private toResponse(record: ReturnWithDetails) {
    const unitPrice =
      record.order.items.find((item) => item.variantId === record.variantId)?.priceAtSale ?? ZERO;

    return {
      id: record.id,
      type: record.type,
      orderId: record.orderId,
      qty: record.qty,
      reason: record.reason,
      refundAmount: record.refundAmount.toFixed(2),
      amountDue: record.amountDue.toFixed(2),
      createdAt: record.createdAt,
      processedBy: record.processedBy,
      item: describeItem(record.variant, unitPrice),
      exchangeItem:
        record.exchangeVariant && record.exchangeUnitPrice
          ? describeItem(record.exchangeVariant, record.exchangeUnitPrice)
          : null,
    };
  }
}
