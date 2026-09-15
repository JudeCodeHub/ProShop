import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPrismaError, PrismaErrorCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { ListAdjustmentsQueryDto } from './dto/list-adjustments-query.dto.js';

@Injectable()
export class InventoryService {
  readonly defaultLowStockThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = config.get<string>('LOW_STOCK_THRESHOLD', '5');
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `LOW_STOCK_THRESHOLD must be a positive whole number, got "${raw}"`,
      );
    }
    this.defaultLowStockThreshold = value;
  }

  async adjustStock(variantId: number, userId: number, dto: AdjustStockDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.productVariant.updateMany({
          where: { id: variantId, stockQty: { gte: -dto.qtyChange } },
          data: { stockQty: { increment: dto.qtyChange } },
        });

        if (count === 0) {
          const current = await tx.productVariant.findUnique({
            where: { id: variantId },
            select: { stockQty: true },
          });
          if (!current) {
            throw new NotFoundException(`Variant ${variantId} not found`);
          }
          throw new ConflictException(
            `Cannot remove ${-dto.qtyChange} units: only ${current.stockQty} in stock`,
          );
        }

        const adjustment = await tx.stockAdjustment.create({
          data: {
            variantId,
            userId,
            qtyChange: dto.qtyChange,
            reason: dto.reason,
          },
        });
        const variant = await tx.productVariant.findUniqueOrThrow({
          where: { id: variantId },
        });
        return { variant, adjustment };
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        throw new UnauthorizedException('Your account no longer exists');
      }
      throw error;
    }
  }

  async findAdjustments(query: ListAdjustmentsQueryDto) {
    const rows = await this.prisma.stockAdjustment.findMany({
      where: { variantId: query.variantId },
      include: {
        user: { select: { id: true, name: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            size: true,
            color: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? 50,
    });

    return rows.map((row) => ({
      id: row.id,
      qtyChange: row.qtyChange,
      reason: row.reason,
      createdAt: row.createdAt,
      user: row.user,
      variant: {
        id: row.variant.id,
        sku: row.variant.sku,
        size: row.variant.size,
        color: row.variant.color,
        productId: row.variant.product.id,
        productName: row.variant.product.name,
      },
    }));
  }

  findLowStock(threshold = this.defaultLowStockThreshold) {
    return this.prisma.productVariant.findMany({
      where: { stockQty: { lt: threshold } },
      include: { product: { include: { category: true } } },
      orderBy: [{ stockQty: 'asc' }, { product: { name: 'asc' } }, { id: 'asc' }],
    });
  }
}
