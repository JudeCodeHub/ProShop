import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  const prisma = { productVariant: { findMany: vi.fn() } };
  const make = (env: Record<string, string>) =>
    new InventoryService(
      prisma as unknown as PrismaService,
      new ConfigService(env),
    );

  beforeEach(() => vi.clearAllMocks());

  it('defaults the low-stock threshold to 5', () => {
    expect(make({}).defaultLowStockThreshold).toBe(5);
  });

  it('reads LOW_STOCK_THRESHOLD from config', () => {
    expect(make({ LOW_STOCK_THRESHOLD: '12' }).defaultLowStockThreshold).toBe(12);
  });

  it.each(['0', '-3', '2.5', 'five', ''])(
    'refuses to start with LOW_STOCK_THRESHOLD=%j',
    (value) => {
      expect(() => make({ LOW_STOCK_THRESHOLD: value })).toThrow(
        'LOW_STOCK_THRESHOLD must be a positive whole number',
      );
    },
  );

  it('uses the configured threshold when none is passed', async () => {
    prisma.productVariant.findMany.mockResolvedValue([]);
    await make({ LOW_STOCK_THRESHOLD: '7' }).findLowStock();
    expect(prisma.productVariant.findMany.mock.calls[0][0].where).toEqual({
      stockQty: { lt: 7 },
    });
  });
});
