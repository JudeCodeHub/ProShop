import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError, PrismaErrorCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoryDto } from './dto/category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return categories.map(({ _count, ...category }) => ({
      ...category,
      productCount: _count.products,
    }));
  }

  async create(dto: CategoryDto) {
    await this.ensureNameAvailable(dto.name);
    try {
      return await this.prisma.category.create({ data: { name: dto.name } });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        throw this.nameTaken(dto.name);
      }
      throw error;
    }
  }

  async update(id: number, dto: CategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    await this.ensureNameAvailable(dto.name, id);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: { name: dto.name },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        throw this.nameTaken(dto.name);
      }
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Category ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: number, moveTo?: number): Promise<void> {
    if (moveTo === id) {
      throw new BadRequestException(
        'moveTo must be a different category from the one being deleted',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.findUnique({
          where: { id },
          select: { name: true },
        });
        if (!category) {
          throw new NotFoundException(`Category ${id} not found`);
        }

        if (moveTo !== undefined) {
          const target = await tx.category.findUnique({
            where: { id: moveTo },
            select: { id: true },
          });
          if (!target) {
            throw new BadRequestException(
              `Cannot move products: category ${moveTo} does not exist`,
            );
          }
          await tx.product.updateMany({
            where: { categoryId: id },
            data: { categoryId: moveTo },
          });
        }

        const count = await tx.product.count({ where: { categoryId: id } });
        if (count > 0) {
          throw this.stillHasProducts(category.name, count);
        }
        await tx.category.delete({ where: { id } });
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Category ${id} not found`);
      }
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        const category = await this.prisma.category.findUnique({
          where: { id },
          select: { name: true, _count: { select: { products: true } } },
        });
        if (!category) {
          throw new NotFoundException(`Category ${id} not found`);
        }
        throw this.stillHasProducts(category.name, category._count.products);
      }
      throw error;
    }
  }

  private stillHasProducts(name: string, count: number) {
    return new ConflictException(
      `Category "${name}" still has ${count} product${count === 1 ? '' : 's'}. Move them to another category or delete them first.`,
    );
  }

  private async ensureNameAvailable(name: string, exceptId?: number) {
    const clash = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: exceptId === undefined ? undefined : { not: exceptId },
      },
      select: { id: true },
    });
    if (clash) {
      throw this.nameTaken(name);
    }
  }

  private nameTaken(name: string) {
    return new ConflictException(`A category named "${name}" already exists`);
  }
}
