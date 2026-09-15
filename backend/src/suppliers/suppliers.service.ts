import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError, PrismaErrorCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SupplierDto } from './dto/supplier.dto.js';

const withOrderCount = {
  _count: { select: { purchaseOrders: true } },
} as const;

type SupplierWithCount = {
  id: number;
  name: string;
  contactInfo: string | null;
  _count: { purchaseOrders: number };
};

const toResponse = ({ _count, ...supplier }: SupplierWithCount) => ({
  ...supplier,
  purchaseOrderCount: _count.purchaseOrders,
});

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const suppliers = await this.prisma.supplier.findMany({
      include: withOrderCount,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return suppliers.map(toResponse);
  }

  async findOne(id: number) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: withOrderCount,
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }
    return toResponse(supplier);
  }

  async create(dto: SupplierDto) {
    return toResponse(
      await this.prisma.supplier.create({
        data: { name: dto.name, contactInfo: dto.contactInfo || null },
        include: withOrderCount,
      }),
    );
  }

  async update(id: number, dto: SupplierDto) {
    try {
      return toResponse(
        await this.prisma.supplier.update({
          where: { id },
          data: { name: dto.name, contactInfo: dto.contactInfo || null },
          include: withOrderCount,
        }),
      );
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Supplier ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await this.prisma.supplier.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Supplier ${id} not found`);
      }
      if (isPrismaError(error, PrismaErrorCode.ForeignKeyViolation)) {
        const count = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
        throw new ConflictException(
          `Supplier ${id} has ${count} purchase order${count === 1 ? '' : 's'} and cannot be deleted`,
        );
      }
      throw error;
    }
  }
}
