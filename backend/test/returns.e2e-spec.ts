import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role, type Settings } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@returns-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface Item {
  variantId: number;
  sku: string;
  productName: string;
  size: string;
  color: string;
  unitPrice: string;
}

interface ReturnBody {
  id: number;
  type: 'return' | 'exchange';
  orderId: number;
  qty: number;
  reason: string;
  refundAmount: string;
  amountDue: string;
  processedBy: { id: number; name: string };
  item: Item;
  exchangeItem: Item | null;
}

describe('Returns and exchanges (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let adminId: number;
  let cashierId: number;
  let categoryId: number;
  let originalSettings: Settings | null;
  const v: Record<'a' | 'b' | 'c' | 'd', { id: number; sku: string }> = {} as never;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (path: string, body: object, token = adminToken) =>
    api().post(path).set(bearer(token)).send(body);

  const login = async (email: string) =>
    ((await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body as { accessToken: string })
      .accessToken;

  const sell = async (items: [variantId: number, qty: number][], discount = 0) =>
    (
      await post(
        '/api/orders',
        { items: items.map(([variantId, qty]) => ({ variantId, qty })), discount, paymentMethod: 'cash' },
        cashierToken,
      ).expect(201)
    ).body as { id: number; total: string };

  const stockOf = async (id: number) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stockQty;
  const returnCount = (orderId: number) => prisma.return.count({ where: { orderId } });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    originalSettings = await prisma.settings.findUnique({ where: { id: 1 } });
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, storeName: 'Returns Store', taxRate: 15 },
      update: { taxRate: 15 },
    });

    const password = await bcrypt.hash(PASSWORD, 4);
    ({ id: adminId } = await prisma.user.create({
      data: { name: 'Ret Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    }));
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'Ret Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E Returns ${run}` } }));
    const product = await prisma.product.create({
      data: { name: 'Return Runner', categoryId, brand: 'Asics', costPrice: 50 },
    });
    const variant = (key: 'a' | 'b' | 'c' | 'd', size: string, sellPrice: number) =>
      prisma.productVariant
        .create({
          data: { productId: product.id, size, color: 'Black', sku: `RET-${run}-${size}`, barcode: `RETBC-${run}-${size}`, sellPrice, stockQty: 50 },
          select: { id: true, sku: true },
        })
        .then((created) => (v[key] = created));
    await variant('a', '40', 100);
    await variant('b', '41', 100);
    await variant('c', '42', 150);
    await variant('d', '43', 80);

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.stockAdjustment.deleteMany({ where: { userId: adminId } });
    await prisma.return.deleteMany({ where: { order: { cashierId } } });
    await prisma.order.deleteMany({ where: { cashierId } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    if (originalSettings) {
      await prisma.settings.update({ where: { id: 1 }, data: originalSettings });
    } else {
      await prisma.settings.deleteMany({ where: { id: 1 } });
    }
    await app.close();
  });

  describe('returns', () => {
    it('previews the refund of what was paid after discount and tax, without changing anything', async () => {
      const order = await sell([[v.a.id, 3], [v.c.id, 1]], 45);
      expect(order.total).toBe('465.75');
      const stockBefore = await stockOf(v.a.id);

      const res = await post('/api/returns/preview', { orderId: order.id, variantId: v.a.id, qty: 2 }).expect(200);
      expect(res.body).toEqual({
        orderId: order.id,
        qty: 2,
        item: { variantId: v.a.id, sku: v.a.sku, productName: 'Return Runner', size: '40', color: 'Black', unitPrice: '100.00' },
        purchasedQty: 3,
        alreadyReturned: 0,
        refundAmount: '207.00',
      });
      expect(await stockOf(v.a.id)).toBe(stockBefore);
      expect(await returnCount(order.id)).toBe(0);
    });

    it('records a return, restocks the item, logs the stock change and adds up partial returns exactly', async () => {
      const order = await sell([[v.a.id, 3], [v.c.id, 1]], 45);
      const stockBefore = await stockOf(v.a.id);

      const first = await post('/api/returns', { orderId: order.id, variantId: v.a.id, qty: 1, reason: '  Too small  ' }).expect(201);
      expect(first.body).toMatchObject({
        type: 'return',
        orderId: order.id,
        qty: 1,
        reason: 'Too small',
        refundAmount: '103.50',
        amountDue: '0.00',
        processedBy: { id: adminId, name: 'Ret Admin' },
        item: { variantId: v.a.id, unitPrice: '100.00' },
        exchangeItem: null,
      });
      expect(await stockOf(v.a.id)).toBe(stockBefore + 1);

      const rest = await post('/api/returns', { orderId: order.id, variantId: v.a.id, qty: 2, reason: 'Changed mind' }).expect(201);
      expect(rest.body.refundAmount).toBe('207.00');
      expect(await stockOf(v.a.id)).toBe(stockBefore + 3);

      const logs = await prisma.stockAdjustment.findMany({ where: { variantId: v.a.id, reason: `Return on order #${order.id}` } });
      expect(logs.map((l) => l.qtyChange).sort((a, b) => a - b)).toEqual([1, 2]);

      const more = await post('/api/returns', { orderId: order.id, variantId: v.a.id, qty: 1, reason: 'Again' }).expect(409);
      expect(more.body.message).toBe(`All 3 of ${v.a.sku} on order ${order.id} have already been returned`);
    });

    it('refuses to return more than is left on the order', async () => {
      const order = await sell([[v.a.id, 2]]);
      const res = await post('/api/returns', { orderId: order.id, variantId: v.a.id, qty: 3, reason: 'Too many' }).expect(409);
      expect(res.body.message).toBe(`Only 2 of ${v.a.sku} on order ${order.id} can still be returned`);
      expect(await returnCount(order.id)).toBe(0);
    });

    it('never returns the same units twice when two returns arrive together', async () => {
      const order = await sell([[v.a.id, 2]]);
      const stockBefore = await stockOf(v.a.id);
      const body = { orderId: order.id, variantId: v.a.id, qty: 2, reason: 'Race' };

      const results = await Promise.all([post('/api/returns', body), post('/api/returns', body)]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await stockOf(v.a.id)).toBe(stockBefore + 2);
      expect(await returnCount(order.id)).toBe(1);
    });

    it('rejects items not on the order, missing orders, held and voided orders', async () => {
      const order = await sell([[v.a.id, 1]]);
      const notOnOrder = await post('/api/returns', { orderId: order.id, variantId: v.b.id, qty: 1, reason: 'x' }).expect(400);
      expect(notOnOrder.body.message).toBe(`Variant ${v.b.id} is not part of order ${order.id}`);
      await post('/api/returns', { orderId: MISSING_ID, variantId: v.a.id, qty: 1, reason: 'x' }).expect(404);

      const held = (await post('/api/orders/hold', { items: [{ variantId: v.a.id, qty: 1 }], paymentMethod: 'cash' }, cashierToken).expect(201)).body as { id: number };
      const heldRes = await post('/api/returns', { orderId: held.id, variantId: v.a.id, qty: 1, reason: 'x' }).expect(409);
      expect(heldRes.body.message).toBe(`Order ${held.id} is held; only completed orders can have returns or exchanges`);

      const voided = await sell([[v.a.id, 1]]);
      await post(`/api/orders/${voided.id}/void`, {}).expect(200);
      await post('/api/returns', { orderId: voided.id, variantId: v.a.id, qty: 1, reason: 'x' }).expect(409);
    });

    it.each([
      ['a zero quantity', { qty: 0, reason: 'x' }],
      ['a missing reason', { qty: 1 }],
      ['a blank reason', { qty: 1, reason: '   ' }],
      ['a client-supplied refund', { qty: 1, reason: 'x', refundAmount: 999 }],
    ])('rejects %s', async (_label, extra) => {
      const order = await sell([[v.a.id, 1]]);
      await post('/api/returns', { orderId: order.id, variantId: v.a.id, ...extra }).expect(400);
      expect(await returnCount(order.id)).toBe(0);
    });

    it('is admin only', async () => {
      const order = await sell([[v.a.id, 1]]);
      const body = { orderId: order.id, variantId: v.a.id, qty: 1, reason: 'x' };
      await post('/api/returns', body, cashierToken).expect(403);
      await post('/api/returns/preview', body, cashierToken).expect(403);
      await api().post('/api/returns').send(body).expect(401);
      expect(await returnCount(order.id)).toBe(0);
    });
  });

  describe('exchanges', () => {
    it('previews a same-price size swap as even', async () => {
      const order = await sell([[v.a.id, 2]], 20);
      expect(order.total).toBe('207.00');

      const res = await post('/api/exchanges/preview', { orderId: order.id, originalVariantId: v.a.id, newVariantId: v.b.id, qty: 1 }).expect(200);
      expect(res.body).toMatchObject({
        purchasedQty: 2,
        alreadyReturned: 0,
        credit: '103.50',
        newItemsCost: '103.50',
        refundAmount: '0.00',
        amountDue: '0.00',
        item: { variantId: v.a.id },
        exchangeItem: { variantId: v.b.id, unitPrice: '100.00' },
      });
      expect(await returnCount(order.id)).toBe(0);
    });

    it('charges the difference for a dearer item and refunds it for a cheaper one, moving stock both ways', async () => {
      const order = await sell([[v.a.id, 2]], 20);
      const before = { a: await stockOf(v.a.id), c: await stockOf(v.c.id), d: await stockOf(v.d.id) };

      const dearer = await post('/api/exchanges', { orderId: order.id, originalVariantId: v.a.id, newVariantId: v.c.id, qty: 1 }).expect(201);
      expect(dearer.body).toMatchObject({
        type: 'exchange',
        qty: 1,
        reason: `Exchanged for ${v.c.sku}`,
        refundAmount: '0.00',
        amountDue: '51.75',
        processedBy: { id: adminId },
        item: { variantId: v.a.id, unitPrice: '100.00' },
        exchangeItem: { variantId: v.c.id, sku: v.c.sku, unitPrice: '150.00' },
      });

      const cheaper = await post('/api/exchanges', { orderId: order.id, originalVariantId: v.a.id, newVariantId: v.d.id, qty: 1, reason: 'Wants the sale shoe' }).expect(201);
      expect(cheaper.body).toMatchObject({ reason: 'Wants the sale shoe', refundAmount: '20.70', amountDue: '0.00' });

      expect([await stockOf(v.a.id), await stockOf(v.c.id), await stockOf(v.d.id)]).toEqual([before.a + 2, before.c - 1, before.d - 1]);

      const logs = await prisma.stockAdjustment.findMany({
        where: { reason: `Exchange on order #${order.id}` },
        orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
      });
      expect(logs.map((l) => [l.variantId, l.qtyChange])).toEqual([
        [v.a.id, 1],
        [v.a.id, 1],
        [v.c.id, -1],
        [v.d.id, -1],
      ]);

      await post('/api/exchanges', { orderId: order.id, originalVariantId: v.a.id, newVariantId: v.b.id, qty: 1 }).expect(409);
      await post('/api/returns', { orderId: order.id, variantId: v.a.id, qty: 1, reason: 'x' }).expect(409);
    });

    it('rejects a swap for the same variant, a missing variant, too little stock or an item not on the order, changing nothing', async () => {
      const order = await sell([[v.a.id, 1]]);
      const stockA = await stockOf(v.a.id);
      const exchange = (body: object) => post('/api/exchanges', { orderId: order.id, originalVariantId: v.a.id, newVariantId: v.b.id, qty: 1, ...body });

      const same = await exchange({ newVariantId: v.a.id }).expect(400);
      expect(same.body.message).toBe('Choose a different size or color to exchange for');
      await exchange({ newVariantId: MISSING_ID }).expect(404);
      await exchange({ originalVariantId: v.c.id }).expect(400);

      await prisma.productVariant.update({ where: { id: v.d.id }, data: { stockQty: 0 } });
      const noStock = await exchange({ newVariantId: v.d.id }).expect(409);
      expect(noStock.body.message).toBe(`Not enough stock for ${v.d.sku}: requested 1, only 0 left`);
      await prisma.productVariant.update({ where: { id: v.d.id }, data: { stockQty: 50 } });

      expect(await stockOf(v.a.id)).toBe(stockA);
      expect(await returnCount(order.id)).toBe(0);
    });

    it('is admin only and validates the body', async () => {
      const order = await sell([[v.a.id, 1]]);
      const body = { orderId: order.id, originalVariantId: v.a.id, newVariantId: v.b.id, qty: 1 };
      await post('/api/exchanges', body, cashierToken).expect(403);
      await post('/api/exchanges', { ...body, qty: 1.5 }).expect(400);
      await post('/api/exchanges', { ...body, amountDue: 0 }).expect(400);
      expect(await returnCount(order.id)).toBe(0);
    });
  });

  describe('GET /api/returns', () => {
    it('lists an order’s returns and exchanges newest first, linked back to the sale', async () => {
      const order = await sell([[v.a.id, 3]]);
      await post('/api/returns', { orderId: order.id, variantId: v.a.id, qty: 1, reason: 'Faulty' }).expect(201);
      await post('/api/exchanges', { orderId: order.id, originalVariantId: v.a.id, newVariantId: v.d.id, qty: 1 }).expect(201);

      const res = await api().get(`/api/returns?orderId=${order.id}`).set(bearer(adminToken)).expect(200);
      const rows = res.body as ReturnBody[];
      expect(rows.map((r) => [r.type, r.orderId, r.item.variantId, r.exchangeItem?.variantId ?? null])).toEqual([
        ['exchange', order.id, v.a.id, v.d.id],
        ['return', order.id, v.a.id, null],
      ]);
      expect(rows[1]).toMatchObject({ reason: 'Faulty', refundAmount: '115.00', processedBy: { name: 'Ret Admin' } });
    });

    it('respects the limit and rejects bad filters and non-admins', async () => {
      const res = await api().get('/api/returns?limit=1').set(bearer(adminToken)).expect(200);
      expect(res.body).toHaveLength(1);
      await api().get('/api/returns?limit=0').set(bearer(adminToken)).expect(400);
      await api().get('/api/returns?orderId=abc').set(bearer(adminToken)).expect(400);
      await api().get('/api/returns').set(bearer(cashierToken)).expect(403);
    });
  });
});
