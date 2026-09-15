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
  let otherCashierId: number;
  let otherCashierToken: string;
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

  const orderCount = () => prisma.order.count({ where: { cashierId: { in: [adminId, cashierId, otherCashierId] } } });

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
    ({ id: otherCashierId } = await prisma.user.create({
      data: { name: 'O Other', email: `other-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
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
    otherCashierToken = await login(`other-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.return.deleteMany({
      where: { order: { cashierId: { in: [adminId, cashierId, otherCashierId] } } },
    });
    await prisma.order.deleteMany({ where: { cashierId: { in: [adminId, cashierId, otherCashierId] } } });
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

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const hold = (body: object, token = cashierToken) =>
    api().post('/api/orders/hold').set(bearer(token)).send(body);
  const holdOne = async (variantId: number, qty: number, token = cashierToken) =>
    (await hold({ items: [{ variantId, qty }], paymentMethod: 'cash' }, token).expect(201)).body as OrderBody;
  const sellOne = async (variantId: number, qty: number) =>
    (await sell({ items: [{ variantId, qty }], paymentMethod: 'cash' }).expect(201)).body as OrderBody;
  const resume = (id: number | string, token: string) =>
    api().post(`/api/orders/${id}/resume`).set(bearer(token));
  const voidOrder = (id: number | string, token = adminToken) =>
    api().post(`/api/orders/${id}/void`).set(bearer(token));
  const statusOf = async (id: number) =>
    (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

  describe('POST /api/orders/hold', () => {
    it('saves a held order with its totals and does not touch or check stock', async () => {
      const variant = await newVariant('40.00', 1);
      const res = await hold({ items: [{ variantId: variant.id, qty: 3 }], discount: 5, paymentMethod: 'card' }).expect(201);
      expect(res.body).toMatchObject({
        status: 'held',
        cashier: { id: cashierId },
        subtotal: '120.00',
        discount: '5.00',
        taxRate: '15.00',
        tax: '17.25',
        total: '132.25',
      });
      expect(await stockOf(variant.id)).toBe(1);
    });

    it('still checks variants, discount, body and login', async () => {
      const variant = await newVariant('10.00', 5);
      await hold({ items: [{ variantId: MISSING_ID, qty: 1 }], paymentMethod: 'cash' }).expect(404);
      await hold({ items: [{ variantId: variant.id, qty: 1 }], discount: 11, paymentMethod: 'cash' }).expect(400);
      await hold({ items: [], paymentMethod: 'cash' }).expect(400);
      await api().post('/api/orders/hold').send({}).expect(401);
    });
  });

  describe('GET /api/orders/held', () => {
    it('lists only the current cashier’s held orders, newest first', async () => {
      const variant = await newVariant('10.00', 10);
      const first = await holdOne(variant.id, 1);
      const second = await holdOne(variant.id, 1);
      const completed = await sellOne(variant.id, 1);
      const someoneElses = await holdOne(variant.id, 1, otherCashierToken);

      const res = await api().get('/api/orders/held').set(bearer(cashierToken)).expect(200);
      const held = res.body as OrderBody[];
      const ids = held.map((o) => o.id);

      expect(ids).toEqual(expect.arrayContaining([first.id, second.id]));
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      expect(ids).not.toContain(completed.id);
      expect(ids).not.toContain(someoneElses.id);
      expect(held.every((o) => o.status === 'held' && o.cashier.id === cashierId)).toBe(true);
    });

    it('requires a token', () => api().get('/api/orders/held').expect(401));
  });

  describe('POST /api/orders/:id/resume', () => {
    it('completes a held order at its held prices and deducts stock', async () => {
      const variant = await newVariant('25.00', 5);
      const held = await holdOne(variant.id, 2);
      await prisma.productVariant.update({ where: { id: variant.id }, data: { sellPrice: 99 } });

      const res = await resume(held.id, cashierToken).expect(200);
      expect(res.body).toMatchObject({ id: held.id, status: 'completed', total: held.total });
      expect((res.body as OrderBody).items[0].unitPrice).toBe('25.00');
      expect(await stockOf(variant.id)).toBe(3);

      const again = await resume(held.id, cashierToken).expect(409);
      expect(again.body.message).toBe(`Order ${held.id} is completed; only held orders can be resumed`);
      expect(await stockOf(variant.id)).toBe(3);
    });

    it('refuses with 409 when stock ran out, and the order stays held', async () => {
      const variant = await newVariant('10.00', 1);
      const held = await holdOne(variant.id, 2);

      const res = await resume(held.id, cashierToken).expect(409);
      expect(res.body.shortages).toEqual([
        { variantId: variant.id, sku: variant.sku, requested: 2, available: 1 },
      ]);
      expect(await statusOf(held.id)).toBe('held');
      expect(await stockOf(variant.id)).toBe(1);
    });

    it('lets only the cashier who held it, or an admin, resume it', async () => {
      const variant = await newVariant('10.00', 5);
      const held = await holdOne(variant.id, 1);

      await resume(held.id, otherCashierToken).expect(403);
      const res = await resume(held.id, adminToken).expect(200);
      expect(res.body).toMatchObject({ status: 'completed', cashier: { id: cashierId } });
    });

    it('deducts stock only once when resumed twice at the same time', async () => {
      const variant = await newVariant('10.00', 5);
      const held = await holdOne(variant.id, 2);

      const results = await Promise.all([resume(held.id, cashierToken), resume(held.id, cashierToken)]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
      expect(await stockOf(variant.id)).toBe(3);
    });

    it('returns 404 for a missing order and 400 for a bad id', async () => {
      await resume(MISSING_ID, cashierToken).expect(404);
      await resume('abc', cashierToken).expect(400);
    });
  });

  describe('POST /api/orders/:id/void', () => {
    it('voids a completed order and puts its stock back', async () => {
      const variant = await newVariant('10.00', 5);
      const done = await sellOne(variant.id, 2);
      expect(await stockOf(variant.id)).toBe(3);

      const res = await voidOrder(done.id).expect(200);
      expect(res.body).toMatchObject({ id: done.id, status: 'voided' });
      expect(await stockOf(variant.id)).toBe(5);

      const again = await voidOrder(done.id).expect(409);
      expect(again.body.message).toBe(`Order ${done.id} is already voided`);
      expect(await stockOf(variant.id)).toBe(5);
    });

    it('voids a held order without changing stock, and it can no longer be resumed', async () => {
      const variant = await newVariant('10.00', 5);
      const held = await holdOne(variant.id, 2);

      await voidOrder(held.id).expect(200);
      expect(await statusOf(held.id)).toBe('voided');
      expect(await stockOf(variant.id)).toBe(5);
      await resume(held.id, cashierToken).expect(409);
      expect(await stockOf(variant.id)).toBe(5);
    });

    it('refuses to void an order that has returns', async () => {
      const variant = await newVariant('10.00', 5);
      const done = await sellOne(variant.id, 2);
      await prisma.return.create({
        data: { orderId: done.id, variantId: variant.id, qty: 1, reason: 'Wrong size', refundAmount: 10 },
      });

      const res = await voidOrder(done.id).expect(409);
      expect(res.body.message).toBe(`Order ${done.id} has returns and cannot be voided`);
      expect(await statusOf(done.id)).toBe('completed');
      expect(await stockOf(variant.id)).toBe(3);
    });

    it('is admin only and handles missing and bad ids', async () => {
      const variant = await newVariant('10.00', 5);
      const done = await sellOne(variant.id, 1);
      await voidOrder(done.id, cashierToken).expect(403);
      await voidOrder(MISSING_ID).expect(404);
      await voidOrder('abc').expect(400);
      expect(await statusOf(done.id)).toBe('completed');
    });
  });
});
