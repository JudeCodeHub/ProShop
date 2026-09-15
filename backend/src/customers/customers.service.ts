import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { isPrismaError, PrismaErrorCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CustomerDto } from './dto/customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { LoyaltyService } from './loyalty.service.js';
import { digitsOnly } from './phone.js';

const ZERO = new Prisma.Decimal(0);

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  loyaltyPoints: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect;

interface PurchaseStats {
  orderCount: number;
  totalSpent: string;
  lastPurchaseAt: Date | null;
}

const NO_PURCHASES: PurchaseStats = { orderCount: 0, totalSpent: '0.00', lastPurchaseAt: null };

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async findAll(query: ListCustomersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const digits = query.search ? digitsOnly(query.search) : '';

    const where: Prisma.CustomerWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {};

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const stats = await this.purchaseStats(customers.map((customer) => customer.id));
    return {
      page,
      pageSize,
      total,
      items: customers.map((customer) => ({ ...customer, ...(stats.get(customer.id) ?? NO_PURCHASES) })),
    };
  }

  async findOne(id: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        ...customerSelect,
        orders: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            createdAt: true,
            status: true,
            paymentMethod: true,
            total: true,
            pointsEarned: true,
            pointsRedeemed: true,
            items: { select: { qty: true } },
            _count: { select: { returns: true } },
          },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }

    const { orders, ...profile } = customer;
    const completed = orders.filter((order) => order.status === OrderStatus.completed);

    return {
      ...profile,
      orderCount: completed.length,
      totalSpent: completed.reduce((sum, order) => sum.plus(order.total), ZERO).toFixed(2),
      lastPurchaseAt: completed[0]?.createdAt ?? null,
      orders: orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        paymentMethod: order.paymentMethod,
        total: order.total.toFixed(2),
        itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
        pointsEarned: order.pointsEarned,
        pointsRedeemed: order.pointsRedeemed,
        returnCount: order._count.returns,
      })),
    };
  }

  async create(dto: CustomerDto) {
    await this.ensureUnique(dto);
    try {
      return await this.prisma.customer.create({
        data: { name: dto.name, phone: dto.phone ?? null, email: dto.email ?? null },
        select: customerSelect,
      });
    } catch (error) {
      throw this.mapUniqueError(error);
    }
  }

  async update(id: number, dto: CustomerDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    await this.ensureUnique(dto, id);
    try {
      return await this.prisma.customer.update({
        where: { id },
        data: { name: dto.name, phone: dto.phone ?? null, email: dto.email ?? null },
        select: customerSelect,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
      throw this.mapUniqueError(error);
    }
  }

  async quoteRedemption(id: number, points: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, loyaltyPoints: true },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    if (points > customer.loyaltyPoints) {
      throw new ConflictException(
        `Customer ${id} has only ${customer.loyaltyPoints} loyalty point${customer.loyaltyPoints === 1 ? '' : 's'}`,
      );
    }
    return {
      customerId: id,
      points,
      discountValue: this.loyalty.discountFor(points).toFixed(2),
      balance: customer.loyaltyPoints,
      balanceAfter: customer.loyaltyPoints - points,
    };
  }

  private async purchaseStats(ids: number[]) {
    if (ids.length === 0) {
      return new Map<number, PurchaseStats>();
    }
    const groups = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, status: OrderStatus.completed },
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
    });
    return new Map<number, PurchaseStats>(
      groups.map((group) => [
        group.customerId as number,
        {
          orderCount: group._count._all,
          totalSpent: (group._sum.total ?? ZERO).toFixed(2),
          lastPurchaseAt: group._max.createdAt,
        },
      ]),
    );
  }

  private async ensureUnique(dto: CustomerDto, exceptId?: number) {
    const conditions: Prisma.CustomerWhereInput[] = [];
    if (dto.phone) conditions.push({ phone: dto.phone });
    if (dto.email) conditions.push({ email: dto.email });
    if (conditions.length === 0) {
      return;
    }

    const clash = await this.prisma.customer.findFirst({
      where: { OR: conditions, id: exceptId === undefined ? undefined : { not: exceptId } },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (clash) {
      const field = dto.phone && clash.phone === dto.phone ? `phone number ${dto.phone}` : `email ${dto.email}`;
      throw new ConflictException(`Customer "${clash.name}" (id ${clash.id}) already uses the ${field}`);
    }
  }

  private mapUniqueError(error: unknown) {
    return isPrismaError(error, PrismaErrorCode.UniqueViolation)
      ? new ConflictException('Another customer already uses this phone number or email')
      : error;
  }
}
