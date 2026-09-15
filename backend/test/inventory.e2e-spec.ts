import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@inventory-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface VariantBody {
  id: number;
  stockQty: number;
  product: { id: number; name: string; category: { id: number } };
}

describe('Inventory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let adminId: number;
  let categoryId: number;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const newVariant = async (stockQty: number) => {
    const n = ++counter;
    const product = await prisma.product.create({
      data: { name: `Stock Item ${run} ${n}`, categoryId, brand: 'Adidas', costPrice: 10 },
    });
    return prisma.productVariant.create({
      data: {
        productId: product.id,
        size: 'M',
        color: 'Black',
        sku: `INV-${run}-${n}`,
        barcode: `INVBC-${run}-${n}`,
        sellPrice: 20,
        stockQty,
      },
    });
  };

  const adjust = (variantId: number, body: object, token = adminToken) =>
    api().post(`/api/variants/${variantId}/adjust-stock`).set(auth(token)).send(body);

  const stockOf = async (variantId: number) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty;

  const logsFor = (variantId: number) =>
    prisma.stockAdjustment.findMany({ where: { variantId }, orderBy: { id: 'asc' } });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    ({ id: adminId } = await prisma.user.create({
      data: { name: 'I Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    }));
    await prisma.user.create({
      data: { name: 'I Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    });
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E Inventory ${run}` } }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.stockAdjustment.deleteMany({ where: { variant: { product: { categoryId } } } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('POST /api/variants/:id/adjust-stock', () => {
    it('adds and removes stock, logging each change with the admin and reason', async () => {
      const variant = await newVariant(0);

      const added = await adjust(variant.id, { qtyChange: 10, reason: '  Delivery count  ' }).expect(201);
      expect(added.body.variant).toMatchObject({ id: variant.id, stockQty: 10 });
      expect(added.body.adjustment).toMatchObject({
        variantId: variant.id,
        userId: adminId,
        qtyChange: 10,
        reason: 'Delivery count',
      });

      const removed = await adjust(variant.id, { qtyChange: -3, reason: 'Damaged' }).expect(201);
      expect(removed.body.variant.stockQty).toBe(7);

      expect(await stockOf(variant.id)).toBe(7);
      expect((await logsFor(variant.id)).map((l) => [l.qtyChange, l.reason, l.userId])).toEqual([
        [10, 'Delivery count', adminId],
        [-3, 'Damaged', adminId],
      ]);
    });

    it('allows removing exactly the stock on hand', async () => {
      const variant = await newVariant(4);
      await adjust(variant.id, { qtyChange: -4, reason: 'Theft' }).expect(201);
      expect(await stockOf(variant.id)).toBe(0);
    });

    it('refuses to go below zero with 409 and logs nothing', async () => {
      const variant = await newVariant(3);
      const res = await adjust(variant.id, { qtyChange: -5, reason: 'Miscount' }).expect(409);
      expect(res.body.message).toBe('Cannot remove 5 units: only 3 in stock');
      expect(await stockOf(variant.id)).toBe(3);
      expect(await logsFor(variant.id)).toHaveLength(0);
    });

    it('never oversells when removals arrive at the same time', async () => {
      const variant = await newVariant(3);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => adjust(variant.id, { qtyChange: -1, reason: 'Race' })),
      );
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([201, 201, 201, 409, 409, 409]);
      expect(await stockOf(variant.id)).toBe(0);
      expect(await logsFor(variant.id)).toHaveLength(3);
    });

    it.each([
      ['a zero change', { qtyChange: 0, reason: 'Nothing' }],
      ['a decimal change', { qtyChange: 1.5, reason: 'Half' }],
      ['a string change', { qtyChange: '5', reason: 'Text' }],
      ['a missing reason', { qtyChange: 1 }],
      ['a blank reason', { qtyChange: 1, reason: '   ' }],
      ['an unknown field', { qtyChange: 1, reason: 'Ok', userId: 1 }],
    ])('rejects %s', async (_label, body) => {
      const variant = await newVariant(5);
      await adjust(variant.id, body).expect(400);
      expect(await logsFor(variant.id)).toHaveLength(0);
    });

    it('returns 404 for a missing variant, 403 for a cashier and 401 without a token', async () => {
      const variant = await newVariant(5);
      const body = { qtyChange: 1, reason: 'Check' };
      await adjust(MISSING_ID, body).expect(404);
      await adjust(variant.id, body, cashierToken).expect(403);
      await api().post(`/api/variants/${variant.id}/adjust-stock`).send(body).expect(401);
      expect(await stockOf(variant.id)).toBe(5);
    });
  });

  describe('GET /api/inventory/low-stock', () => {
    const lowStockIds = async (query: string, ids: number[]) => {
      const res = await api().get(`/api/inventory/low-stock${query}`).set(auth(adminToken)).expect(200);
      return (res.body as VariantBody[]).filter((v) => ids.includes(v.id));
    };

    it('uses LOW_STOCK_THRESHOLD (5) by default, lowest stock first, with product and category', async () => {
      const variants = await Promise.all([9, 4, 0, 5, 2].map(newVariant));
      const ids = variants.map((v) => v.id);

      const listed = await lowStockIds('', ids);
      expect(listed.map((v) => v.stockQty)).toEqual([0, 2, 4]);
      expect(listed[0].product).toMatchObject({ category: { id: categoryId } });
    });

    it('accepts a custom threshold', async () => {
      const variants = await Promise.all([0, 2, 3, 10].map(newVariant));
      const listed = await lowStockIds('?threshold=3', variants.map((v) => v.id));
      expect(listed.map((v) => v.stockQty)).toEqual([0, 2]);
    });

    it('rejects invalid thresholds and unknown params', async () => {
      for (const query of ['?threshold=abc', '?threshold=0', '?threshold=-1', '?threshold=2.5', '?limit=5']) {
        await api().get(`/api/inventory/low-stock${query}`).set(auth(adminToken)).expect(400);
      }
    });

    it('forbids a cashier', () =>
      api().get('/api/inventory/low-stock').set(auth(cashierToken)).expect(403));
  });
});
