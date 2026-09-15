import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
} from './dto/purchase-order.dto.js';

const details = {
  supplier: { select: { id: true, name: true } },
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
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderWithDetails = Prisma.PurchaseOrderGetPayload<{ include: typeof details }>;

const totalsOf = (items: { qty: number; costPrice: Prisma.Decimal }[]) => ({
  totalQty: items.reduce((n, item) => n + item.qty, 0),
  totalCost: items
    .reduce((sum, item) => sum.plus(item.costPrice.times(item.qty)), new Prisma.Decimal(0))
    .toFixed(2),
});

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePurchaseOrderDto) {
    const seen = new Set<number>();
    for (const { variantId } of dto.items) {
      if (seen.has(variantId)) {
        throw new BadRequestException(
          `Variant ${variantId} appears more than once; list each variant once`,
        );
      }
      seen.add(variantId);
    }

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { id: true },
      });
      if (!supplier) {
        throw new BadRequestException(`Supplier ${dto.supplierId} does not exist`);
      }

      const found = await tx.productVariant.findMany({
        where: { id: { in: [...seen] } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((v) => v.id));
      const missing = [...seen].filter((id) => !foundIds.has(id));
      if (missing.length) {
        throw new NotFoundException(`Variant not found: ${missing.join(', ')}`);
      }

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          supplierId: dto.supplierId,
          items: {
            create: dto.items.map((item) => ({
              variantId: item.variantId,
              qty: item.qty,
              costPrice: item.costPrice,
            })),
          },
        },
        include: details,
      });
      return this.toDetail(purchaseOrder);
    });
  }

  async findAll(query: ListPurchaseOrdersQueryDto) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { status: query.status, supplierId: query.supplierId },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { select: { qty: true, costPrice: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      supplier: order.supplier,
      itemCount: order.items.length,
      ...totalsOf(order.items),
    }));
  }

  async findOne(id: number) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: details,
    });
    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }
    return this.toDetail(purchaseOrder);
  }

  receive(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id },
        select: {
          items: {
            select: {
              variantId: true,
              qty: true,
              costPrice: true,
              variant: { select: { productId: true } },
            },
          },
        },
      });
      if (!purchaseOrder) {
        throw new NotFoundException(`Purchase order ${id} not found`);
      }

      const { count } = await tx.purchaseOrder.updateMany({
        where: { id, status: PurchaseOrderStatus.pending },
        data: { status: PurchaseOrderStatus.received },
      });
      if (count === 0) {
        throw new ConflictException(`Purchase order ${id} has already been received`);
      }

      const items = [...purchaseOrder.items].sort((a, b) => a.variantId - b.variantId);
      for (const item of items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { increment: item.qty } },
        });
      }

      await tx.stockAdjustment.createMany({
        data: items.map((item) => ({
          variantId: item.variantId,
          userId,
          qtyChange: item.qty,
          reason: `Received purchase order #${id}`,
        })),
      });

      const costByProduct = new Map<number, { qty: number; cost: Prisma.Decimal }>();
      for (const item of items) {
        const entry = costByProduct.get(item.variant.productId) ?? {
          qty: 0,
          cost: new Prisma.Decimal(0),
        };
        entry.qty += item.qty;
        entry.cost = entry.cost.plus(item.costPrice.times(item.qty));
        costByProduct.set(item.variant.productId, entry);
      }
      for (const [productId, { qty, cost }] of [...costByProduct].sort(([a], [b]) => a - b)) {
        await tx.product.update({
          where: { id: productId },
          data: {
            costPrice: cost.dividedBy(qty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          },
        });
      }

      return this.toDetail(
        await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: details }),
      );
    });
  }

  private toDetail(purchaseOrder: PurchaseOrderWithDetails) {
    return {
      id: purchaseOrder.id,
      status: purchaseOrder.status,
      createdAt: purchaseOrder.createdAt,
      supplier: purchaseOrder.supplier,
      items: purchaseOrder.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        size: item.variant.size,
        color: item.variant.color,
        qty: item.qty,
        costPrice: item.costPrice.toFixed(2),
        lineTotal: item.costPrice.times(item.qty).toFixed(2),
      })),
      ...totalsOf(purchaseOrder.items),
    };
  }
}
