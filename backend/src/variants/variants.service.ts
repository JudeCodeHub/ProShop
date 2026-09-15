import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { isPrismaError, PrismaErrorCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateVariantDto } from './dto/create-variant.dto.js';
import { UpdateVariantDto } from './dto/update-variant.dto.js';
import { buildBarcode, buildSku } from './variant-codes.js';

const withProduct = {
  product: { include: { category: true } },
} satisfies Prisma.ProductVariantInclude;

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(productId: number) {
    await this.ensureProductExists(productId);
    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: [{ size: 'asc' }, { color: 'asc' }],
    });
  }

  async findByBarcode(code: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { barcode: code },
      include: withProduct,
    });
    if (!variant) {
      throw new NotFoundException(`No variant with barcode ${code}`);
    }
    return variant;
  }

  async create(productId: number, dto: CreateVariantDto) {
    await this.ensureProductExists(productId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { id } = await tx.productVariant.create({
          data: {
            productId,
            size: dto.size,
            color: dto.color,
            sellPrice: dto.sellPrice,
            stockQty: dto.stockQty ?? 0,
            sku: buildSku(productId, dto.size, dto.color),
            barcode: `pending-${randomUUID()}`,
          },
          select: { id: true },
        });
        return tx.productVariant.update({
          where: { id },
          data: { barcode: buildBarcode(id) },
        });
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        throw this.duplicate(productId, dto);
      }
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        throw new NotFoundException(`Product ${productId} not found`);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateVariantDto) {
    const existing = await this.prisma.productVariant.findUnique({
      where: { id },
      select: { productId: true },
    });
    if (!existing) {
      throw new NotFoundException(`Variant ${id} not found`);
    }

    try {
      return await this.prisma.productVariant.update({
        where: { id },
        data: {
          size: dto.size,
          color: dto.color,
          sellPrice: dto.sellPrice,
          sku: buildSku(existing.productId, dto.size, dto.color),
        },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        throw this.duplicate(existing.productId, dto);
      }
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Variant ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await this.prisma.productVariant.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Variant ${id} not found`);
      }
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        throw new ConflictException(
          `Variant ${id} cannot be deleted because it has sales, returns, purchase orders or stock adjustments`,
        );
      }
      throw error;
    }
  }

  private async ensureProductExists(productId: number): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }
  }

  private duplicate(productId: number, dto: UpdateVariantDto) {
    return new ConflictException(
      `Product ${productId} already has a ${dto.size} / ${dto.color} variant`,
    );
  }
}
