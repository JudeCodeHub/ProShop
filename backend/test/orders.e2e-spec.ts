import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role, type Settings } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@orders-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface OrderBody {
  id: number;
  status: string;
  paymentMethod: string;
  customer: { id: number; name: string } | null;
  cashier: { id: number; name: string };
  items: {
    variantId: number;
    sku: string;
    productName: string;
    size: string;
    color: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
  }[];
  subtotal: string;
  discount: string;
  taxRate: string;
  tax: string;
  total: string;
}

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let adminId: number;
  let cashierId: number;
  let categoryId: number;
  let productId: number;
  let customerId: number;
  let originalSettings: Settings | null;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const sell = (body: object, token = cashierToken) =>
    api().post('/api/orders').set('Authorization', `Bearer ${token}`).send(body);

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const newVariant = (sellPrice: string, stockQty: number) => {
    const n = ++counter;
    return prisma.productVariant.create({
      data: {
        productId,
        size: `S${n}`,
        color: 'Black',
        sku: `ORD-${run}-${n}`,
        barcode: `ORDBC-${run}-${n}`,
        sellPrice,
        stockQty,
      },
    });
  };

  const stockOf = async (id: number) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stockQty;

  const orderCount = () => prisma.order.count({ where: { cashierId: { in: [adminId, cashierId] } } });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    originalSettings = await prisma.settings.findUnique({ where: { id: 1 } });
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, storeName: 'E2E Store', taxRate: 15 },
      update: { taxRate: 15 },
    });

    const password = await bcrypt.hash(PASSWORD, 4);
    ({ id: adminId } = await prisma.user.create({
      data: { name: 'O Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    }));
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'O Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E Orders ${run}` } }));
    ({ id: productId } = await prisma.product.create({
      data: { name: 'Pro Runner', categoryId, brand: 'Asics', costPrice: 80 },
    }));
    ({ id: customerId } = await prisma.customer.create({
      data: { name: 'Kamal Perera', phone: `07${String(run).slice(-8)}` },
    }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { cashierId: { in: [adminId, cashierId] } } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    if (originalSettings) {
      await prisma.settings.update({ where: { id: 1 }, data: originalSettings });
    } else {
      await prisma.settings.deleteMany({ where: { id: 1 } });
    }
    await app.close();
  });

  describe('POST /api/orders', () => {
    it('requires a token', () => api().post('/api/orders').send({}).expect(401));

    it('completes a sale with the full breakdown, stores it and deducts stock', async () => {
      const shoe = await newVariant('19.99', 10);
      const bag = await newVariant('150.00', 2);

      const res = await sell({
        items: [
          { variantId: shoe.id, qty: 3 },
          { variantId: bag.id, qty: 1 },
        ],
        discount: 10,
        paymentMethod: 'cash',
      }).expect(201);
      const order = res.body as OrderBody;

      expect(order).toMatchObject({
        status: 'completed',
        paymentMethod: 'cash',
        customer: null,
        cashier: { id: cashierId, name: 'O Cashier' },
        subtotal: '209.97',
        discount: '10.00',
        taxRate: '15.00',
        tax: '30.00',
        total: '229.97',
      });
      expect(order.items).toEqual([
        expect.objectContaining({ variantId: shoe.id, sku: shoe.sku, productName: 'Pro Runner', qty: 3, unitPrice: '19.99', lineTotal: '59.97' }),
        expect.objectContaining({ variantId: bag.id, qty: 1, unitPrice: '150.00', lineTotal: '150.00' }),
      ]);

      expect(await stockOf(shoe.id)).toBe(7);
      expect(await stockOf(bag.id)).toBe(1);

      const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      expect([stored.total.toFixed(2), stored.tax.toFixed(2), stored.discount.toFixed(2)]).toEqual(['229.97', '30.00', '10.00']);
      expect(stored.cashierId).toBe(cashierId);
      expect(stored.items.map((i) => [i.variantId, i.qty, i.priceAtSale.toFixed(2)])).toEqual([
        [shoe.id, 3, '19.99'],
        [bag.id, 1, '150.00'],
      ]);
    });

    it('links a customer, defaults the discount to 0 and lets an admin sell', async () => {
      const variant = await newVariant('100.00', 5);
      const res = await sell({ customerId, items: [{ variantId: variant.id, qty: 1 }], paymentMethod: 'card' }, adminToken).expect(201);
      expect(res.body).toMatchObject({
        customer: { id: customerId, name: 'Kamal Perera' },
        cashier: { id: adminId },
        subtotal: '100.00',
        discount: '0.00',
        tax: '15.00',
        total: '115.00',
      });
    });

    it('merges repeated lines for the same variant', async () => {
      const variant = await newVariant('5.00', 10);
      const res = await sell({
        items: [
          { variantId: variant.id, qty: 1 },
          { variantId: variant.id, qty: 2 },
        ],
        paymentMethod: 'split',
      }).expect(201);
      expect((res.body as OrderBody).items).toHaveLength(1);
      expect((res.body as OrderBody).items[0]).toMatchObject({ qty: 3, lineTotal: '15.00' });
      expect(await stockOf(variant.id)).toBe(7);
    });

    it('lists every stock shortage in one 409 and changes nothing', async () => {
      const a = await newVariant('10.00', 1);
      const b = await newVariant('10.00', 0);
      const c = await newVariant('10.00', 50);
      const before = await orderCount();

      const res = await sell({
        items: [
          { variantId: a.id, qty: 3 },
          { variantId: b.id, qty: 1 },
          { variantId: c.id, qty: 1 },
        ],
        paymentMethod: 'cash',
      }).expect(409);

      expect(res.body.shortages).toEqual([
        { variantId: a.id, sku: a.sku, requested: 3, available: 1 },
        { variantId: b.id, sku: b.sku, requested: 1, available: 0 },
      ]);
      expect(res.body.message).toContain(`${a.sku} (requested 3, only 1 left)`);
      expect([await stockOf(a.id), await stockOf(b.id), await stockOf(c.id)]).toEqual([1, 0, 50]);
      expect(await orderCount()).toBe(before);
    });

    it('returns 404 for a missing variant and changes nothing', async () => {
      const variant = await newVariant('10.00', 5);
      const before = await orderCount();
      const res = await sell({
        items: [
          { variantId: variant.id, qty: 1 },
          { variantId: MISSING_ID, qty: 1 },
        ],
        paymentMethod: 'cash',
      }).expect(404);
      expect(res.body.message).toBe(`Variant not found: ${MISSING_ID}`);
      expect(await stockOf(variant.id)).toBe(5);
      expect(await orderCount()).toBe(before);
    });

    it('rejects a discount larger than the subtotal and a missing customer', async () => {
      const variant = await newVariant('20.00', 5);
      const res = await sell({ items: [{ variantId: variant.id, qty: 1 }], discount: 20.01, paymentMethod: 'cash' }).expect(400);
      expect(res.body.message).toBe('Discount 20.01 is more than the subtotal 20.00');

      await sell({ customerId: MISSING_ID, items: [{ variantId: variant.id, qty: 1 }], paymentMethod: 'cash' }).expect(400);
      expect(await stockOf(variant.id)).toBe(5);
    });

    it('never oversells when sales for the last units arrive at the same time', async () => {
      const variant = await newVariant('50.00', 2);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => sell({ items: [{ variantId: variant.id, qty: 1 }], paymentMethod: 'cash' })),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 201, 409, 409]);
      expect(await stockOf(variant.id)).toBe(0);
    });

    it.each([
      ['no items', { items: [], paymentMethod: 'cash' }],
      ['a zero quantity', { items: [{ variantId: 1, qty: 0 }], paymentMethod: 'cash' }],
      ['a decimal quantity', { items: [{ variantId: 1, qty: 1.5 }], paymentMethod: 'cash' }],
      ['a text variant id', { items: [{ variantId: 'abc', qty: 1 }], paymentMethod: 'cash' }],
      ['a price sent by the client', { items: [{ variantId: 1, qty: 1, price: 0.01 }], paymentMethod: 'cash' }],
      ['an unknown payment method', { items: [{ variantId: 1, qty: 1 }], paymentMethod: 'bitcoin' }],
      ['a missing payment method', { items: [{ variantId: 1, qty: 1 }] }],
      ['a negative discount', { items: [{ variantId: 1, qty: 1 }], discount: -1, paymentMethod: 'cash' }],
      ['a discount with 3 decimals', { items: [{ variantId: 1, qty: 1 }], discount: 1.005, paymentMethod: 'cash' }],
      ['a client-supplied total', { items: [{ variantId: 1, qty: 1 }], paymentMethod: 'cash', total: 1 }],
      ['a client-supplied cashier', { items: [{ variantId: 1, qty: 1 }], paymentMethod: 'cash', cashierId: 1 }],
    ])('rejects %s', (_label, body) => sell(body).expect(400));
  });
});
