import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { isPrismaError, PrismaErrorCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

const productInclude = {
  category: true,
  variants: { orderBy: [{ size: 'asc' }, { color: 'asc' }] },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ListProductsQueryDto) {
    return this.prisma.product.findMany({
      where: {
        categoryId: query.categoryId,
        brand: query.brand
          ? { equals: query.brand, mode: 'insensitive' }
          : undefined,
      },
      include: productInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: dto,
        include: productInclude,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        throw new BadRequestException(`Category ${dto.categoryId} does not exist`);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateProductDto) {
    try {
      return await this.prisma.product.update({
        where: { id },
        data: dto,
        include: productInclude,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Product ${id} not found`);
      }
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        throw new BadRequestException(`Category ${dto.categoryId} does not exist`);
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Product ${id} not found`);
      }
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        throw new ConflictException(
          `Product ${id} cannot be deleted because its variants have sales, returns, purchase orders or stock adjustments`,
        );
      }
      throw error;
    }
  }
}
