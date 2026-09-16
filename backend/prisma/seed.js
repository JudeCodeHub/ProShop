import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, '../dist/generated/prisma/client.js');
const codesPath = resolve(here, '../dist/variants/variant-codes.js');

if (!existsSync(clientPath) || !existsSync(codesPath)) {
  console.error('Build the backend first: npm run build');
  process.exit(1);
}

const { PrismaClient } = await import(clientPath);
const { buildBarcode, buildSku } = await import(codesPath);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ADMIN = {
  name: process.env.SEED_ADMIN_NAME ?? 'Store Owner',
  email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@proshop.lk').toLowerCase(),
  password: process.env.SEED_ADMIN_PASSWORD ?? 'admin-password-1',
};
const CASHIER = {
  name: process.env.SEED_CASHIER_NAME ?? 'Shop Cashier',
  email: (process.env.SEED_CASHIER_EMAIL ?? 'cashier@proshop.lk').toLowerCase(),
  password: process.env.SEED_CASHIER_PASSWORD ?? 'cashier-password-1',
};

const CATALOG = [
  {
    category: 'Footwear',
    products: [
      { name: 'Air Zoom Pegasus', brand: 'Nike', costPrice: 12000, sellPrice: 18500, sizes: ['40', '41', '42', '43'], colors: ['Black', 'White'], stock: 6 },
      { name: 'Ultraboost Light', brand: 'Adidas', costPrice: 15000, sellPrice: 23000, sizes: ['41', '42', '43'], colors: ['Grey'], stock: 4 },
      { name: 'Court Grip Indoor', brand: 'Asics', costPrice: 8000, sellPrice: 12500, sizes: ['39', '40', '41'], colors: ['Blue'], stock: 3 },
    ],
  },
  {
    category: 'Apparel',
    products: [
      { name: 'Club Training Tee', brand: 'Nike', costPrice: 1500, sellPrice: 2990, sizes: ['S', 'M', 'L', 'XL'], colors: ['White', 'Navy'], stock: 12 },
      { name: 'Team Track Pants', brand: 'Puma', costPrice: 2800, sellPrice: 4990, sizes: ['M', 'L', 'XL'], colors: ['Black'], stock: 8 },
    ],
  },
  {
    category: 'Equipment',
    products: [
      { name: 'Match Volleyball', brand: 'Mikasa', costPrice: 4200, sellPrice: 6900, sizes: ['5'], colors: ['Yellow'], stock: 10 },
      { name: 'Cricket Bat Willow', brand: 'SG', costPrice: 9500, sellPrice: 15900, sizes: ['SH'], colors: ['Natural'], stock: 5 },
    ],
  },
  {
    category: 'Accessories',
    products: [
      { name: 'Grip Socks', brand: 'Adidas', costPrice: 450, sellPrice: 990, sizes: ['One size'], colors: ['Black', 'White'], stock: 20 },
      { name: 'Water Bottle 750ml', brand: 'Puma', costPrice: 700, sellPrice: 1490, sizes: ['750ml'], colors: ['Blue'], stock: 15 },
    ],
  },
];

async function seedUser({ name, email, password }, role) {
  const hashed = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    create: { name, email, password: hashed, role },
    update: { name, role, isActive: true },
    select: { id: true, email: true, role: true },
  });
}

async function seedVariant(productId, size, color, sellPrice, stockQty) {
  const sku = buildSku(productId, size, color);
  const existing = await prisma.productVariant.findUnique({ where: { sku }, select: { id: true } });
  if (existing) {
    return prisma.productVariant.update({
      where: { id: existing.id },
      data: { sellPrice, stockQty },
      select: { id: true },
    });
  }

  const created = await prisma.productVariant.create({
    data: { productId, size, color, sku, barcode: `pending-${sku}`, sellPrice, stockQty },
    select: { id: true },
  });
  return prisma.productVariant.update({
    where: { id: created.id },
    data: { barcode: buildBarcode(created.id) },
    select: { id: true },
  });
}

async function main() {
  const admin = await seedUser(ADMIN, 'admin');
  const cashier = await seedUser(CASHIER, 'cashier');

  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      storeName: 'ProShop Colombo',
      address: '12 Galle Road, Colombo 03',
      taxRate: 15,
      currency: 'LKR',
      receiptFooterText: 'Thank you! Exchanges within 14 days with this receipt.',
    },
    update: {},
  });

  let products = 0;
  let variants = 0;

  for (const group of CATALOG) {
    const existingCategory = await prisma.category.findFirst({
      where: { name: { equals: group.category, mode: 'insensitive' } },
      select: { id: true },
    });
    const category =
      existingCategory ?? (await prisma.category.create({ data: { name: group.category }, select: { id: true } }));

    for (const item of group.products) {
      const existingProduct = await prisma.product.findFirst({
        where: {
          name: { equals: item.name, mode: 'insensitive' },
          brand: { equals: item.brand, mode: 'insensitive' },
        },
        select: { id: true },
      });
      const product =
        existingProduct ??
        (await prisma.product.create({
          data: { name: item.name, brand: item.brand, costPrice: item.costPrice, categoryId: category.id },
          select: { id: true },
        }));
      products += existingProduct ? 0 : 1;

      for (const size of item.sizes) {
        for (const color of item.colors) {
          await seedVariant(product.id, size, color, item.sellPrice, item.stock);
          variants += 1;
        }
      }
    }
  }

  console.log('Seed finished.');
  console.log(`  categories: ${CATALOG.length}, new products: ${products}, variants: ${variants}`);
  console.log(`  admin:   ${admin.email} / ${ADMIN.password}`);
  console.log(`  cashier: ${cashier.email} / ${CASHIER.password}`);
  console.log('  Change these passwords before using the shop for real.');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
