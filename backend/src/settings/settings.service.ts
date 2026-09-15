import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

const SETTINGS_ID = 1;

export interface StoreSettings {
  storeName: string;
  address: string | null;
  logoUrl: string | null;
  taxRate: Prisma.Decimal;
  currency: string;
  receiptFooterText: string | null;
}

export const DEFAULT_SETTINGS = {
  storeName: 'ProShop',
  address: null,
  logoUrl: null,
  taxRate: '0',
  currency: 'LKR',
  receiptFooterText: null,
} as const;

type SettingsReader = Pick<Prisma.TransactionClient, 'settings'>;

const fromRow = (row: StoreSettings): StoreSettings => ({
  storeName: row.storeName,
  address: row.address,
  logoUrl: row.logoUrl,
  taxRate: row.taxRate,
  currency: row.currency,
  receiptFooterText: row.receiptFooterText,
});

export const toSettingsResponse = (settings: StoreSettings) => ({
  ...settings,
  taxRate: settings.taxRate.toFixed(2),
});

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(db: SettingsReader = this.prisma): Promise<StoreSettings> {
    const row = await db.settings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) {
      return { ...DEFAULT_SETTINGS, taxRate: new Prisma.Decimal(DEFAULT_SETTINGS.taxRate) };
    }
    return fromRow(row);
  }

  async update(dto: UpdateSettingsDto): Promise<StoreSettings> {
    const data = {
      storeName: dto.storeName,
      address: dto.address ?? null,
      logoUrl: dto.logoUrl ?? null,
      taxRate: dto.taxRate,
      currency: dto.currency,
      receiptFooterText: dto.receiptFooterText ?? null,
    };
    const row = await this.prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    return fromRow(row);
  }
}
