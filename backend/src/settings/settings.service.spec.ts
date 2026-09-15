import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService, toSettingsResponse } from './settings.service.js';

describe('SettingsService', () => {
  const prisma = { settings: { findUnique: vi.fn(), upsert: vi.fn() } };
  const service = new SettingsService(prisma as unknown as PrismaService);

  beforeEach(() => vi.clearAllMocks());

  it('returns the defaults when no settings row exists, without creating one', async () => {
    prisma.settings.findUnique.mockResolvedValue(null);
    expect(toSettingsResponse(await service.get())).toEqual({
      storeName: 'ProShop',
      address: null,
      logoUrl: null,
      taxRate: '0.00',
      currency: 'LKR',
      receiptFooterText: null,
    });
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('returns the saved row without its id', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      storeName: 'ProShop Colombo',
      address: '12 Galle Road',
      logoUrl: null,
      taxRate: new Prisma.Decimal('18'),
      currency: 'LKR',
      receiptFooterText: 'Thanks',
    });
    const settings = await service.get();
    expect(settings).not.toHaveProperty('id');
    expect(toSettingsResponse(settings)).toMatchObject({ storeName: 'ProShop Colombo', taxRate: '18.00' });
  });

  it('reads through the client it is given, such as a transaction', async () => {
    const tx = { settings: { findUnique: vi.fn().mockResolvedValue(null) } };
    await service.get(tx as unknown as Prisma.TransactionClient);
    expect(tx.settings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(prisma.settings.findUnique).not.toHaveBeenCalled();
  });

  it('saves the single row with id 1 and clears optional fields that are left out', async () => {
    prisma.settings.upsert.mockImplementation(({ create }: { create: object }) => Promise.resolve({ ...create, taxRate: new Prisma.Decimal('8') }));
    await service.update({ storeName: 'ProShop', taxRate: 8, currency: 'USD' });

    const { where, create, update } = prisma.settings.upsert.mock.calls[0][0];
    expect(where).toEqual({ id: 1 });
    expect(create).toMatchObject({ id: 1, address: null, logoUrl: null, receiptFooterText: null });
    expect(update).toEqual({ storeName: 'ProShop', address: null, logoUrl: null, taxRate: 8, currency: 'USD', receiptFooterText: null });
  });
});
