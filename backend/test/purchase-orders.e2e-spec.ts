import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@po-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface PurchaseOrderBody {
  id: number;
  status: string;
  supplier: { id: number; name: string };
  items: { variantId: number; sku: string; productName: string; qty: number; costPrice: string; lineTotal: string }[];
  totalQty: number;
  totalCost: string;
}

interface ListItem {
  id: number;
  status: string;
  supplier: { id: number };
  itemCount: number;
  totalQty: number;
  totalCost: string;
}

describe('Purchase orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let adminId: number;
  let supplierId: number;
  let otherSupplierId: number;
  let categoryId: number;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const newProduct = async (costPrice: number, stocks: number[]) => {
    const n = ++counter;
    const product = await prisma.product.create({
      data: { name: `PO Item ${run} ${n}`, categoryId, brand: 'Puma', costPrice },
    });
    const variants = [];
    for (const [i, stockQty] of stocks.entries()) {
      variants.push(
        await prisma.productVariant.create({
          data: { productId: product.id, size: `S${i}`, color: 'Blue', sku: `PO-${run}-${n}-${i}`, barcode: `POBC-${run}-${n}-${i}`, sellPrice: 99, stockQty },
        }),
      );
    }
    return { product, variants };
  };

  const createPo = (body: object, token = adminToken) =>
    api().post('/api/purchase-orders').set(bearer(token)).send(body);

  const receive = (id: number | string, token = adminToken) =>
    api().post(`/api/purchase-orders/${id}/receive`).set(bearer(token));

  const stockOf = async (id: number) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stockQty;

  const costOf = async (id: number) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).costPrice.toFixed(2);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    ({ id: adminId } = await prisma.user.create({
      data: { name: 'PO Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    }));
    await prisma.user.create({
      data: { name: 'PO Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    });
    ({ id: supplierId } = await prisma.supplier.create({ data: { name: `E2E PO Supplier ${run}` } }));
    ({ id: otherSupplierId } = await prisma.supplier.create({ data: { name: `E2E PO Other ${run}` } }));
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E PO ${run}` } }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.stockAdjustment.deleteMany({ where: { variant: { product: { categoryId } } } });
    await prisma.purchaseOrder.deleteMany({ where: { supplierId: { in: [supplierId, otherSupplierId] } } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.supplier.deleteMany({ where: { id: { in: [supplierId, otherSupplierId] } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('POST /api/purchase-orders', () => {
    it('creates a pending order with item details and totals, without touching stock', async () => {
      const { variants: [a, b] } = await newProduct(50, [2, 0]);

      const res = await createPo({
        supplierId,
        items: [
          { variantId: a.id, qty: 10, costPrice: 60 },
          { variantId: b.id, qty: 4, costPrice: 45.5 },
        ],
      }).expect(201);
      const po = res.body as PurchaseOrderBody;

      expect(po).toMatchObject({
        status: 'pending',
        supplier: { id: supplierId, name: `E2E PO Supplier ${run}` },
        totalQty: 14,
        totalCost: '782.00',
      });
      expect(po.items).toEqual([
        expect.objectContaining({ variantId: a.id, sku: a.sku, qty: 10, costPrice: '60.00', lineTotal: '600.00' }),
        expect.objectContaining({ variantId: b.id, sku: b.sku, qty: 4, costPrice: '45.50', lineTotal: '182.00' }),
      ]);
      expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([2, 0]);
    });

    it('rejects a missing supplier, missing variants and repeated variants', async () => {
      const { variants: [a] } = await newProduct(10, [1]);

      const noSupplier = await createPo({ supplierId: MISSING_ID, items: [{ variantId: a.id, qty: 1, costPrice: 1 }] }).expect(400);
      expect(noSupplier.body.message).toBe(`Supplier ${MISSING_ID} does not exist`);

      const noVariant = await createPo({
        supplierId,
        items: [
          { variantId: a.id, qty: 1, costPrice: 1 },
          { variantId: MISSING_ID, qty: 1, costPrice: 1 },
        ],
      }).expect(404);
      expect(noVariant.body.message).toBe(`Variant not found: ${MISSING_ID}`);

      const repeated = await createPo({
        supplierId,
        items: [
          { variantId: a.id, qty: 1, costPrice: 1 },
          { variantId: a.id, qty: 2, costPrice: 2 },
        ],
      }).expect(400);
      expect(repeated.body.message).toBe(`Variant ${a.id} appears more than once; list each variant once`);
    });

    it.each([
      ['no items', { items: [] }],
      ['a zero quantity', { items: [{ variantId: 1, qty: 0, costPrice: 1 }] }],
      ['a negative cost', { items: [{ variantId: 1, qty: 1, costPrice: -1 }] }],
      ['a cost with 3 decimals', { items: [{ variantId: 1, qty: 1, costPrice: 1.005 }] }],
      ['an unknown item field', { items: [{ variantId: 1, qty: 1, costPrice: 1, sellPrice: 2 }] }],
      ['a client-supplied status', { items: [{ variantId: 1, qty: 1, costPrice: 1 }], status: 'received' }],
    ])('rejects %s', (_label, body) => createPo({ supplierId, ...body }).expect(400));

    it('is admin only', async () => {
      await api().post('/api/purchase-orders').send({}).expect(401);
      await createPo({ supplierId, items: [{ variantId: 1, qty: 1, costPrice: 1 }] }, cashierToken).expect(403);
      await api().get('/api/purchase-orders').set(bearer(cashierToken)).expect(403);
    });
  });

  describe('GET /api/purchase-orders', () => {
    it('lists newest first with totals, and filters by status and supplier', async () => {
      const { variants: [a] } = await newProduct(10, [0]);
      const first = (await createPo({ supplierId, items: [{ variantId: a.id, qty: 2, costPrice: 5 }] }).expect(201)).body as PurchaseOrderBody;
      const second = (await createPo({ supplierId: otherSupplierId, items: [{ variantId: a.id, qty: 3, costPrice: 7.25 }] }).expect(201)).body as PurchaseOrderBody;
      await receive(first.id).expect(200);

      const all = (await api().get('/api/purchase-orders').set(bearer(adminToken)).expect(200)).body as ListItem[];
      const ids = all.map((o) => o.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      expect(all.find((o) => o.id === second.id)).toEqual(
        expect.objectContaining({ status: 'pending', supplier: { id: otherSupplierId, name: `E2E PO Other ${run}` }, itemCount: 1, totalQty: 3, totalCost: '21.75' }),
      );

      const received = (await api().get(`/api/purchase-orders?status=received&supplierId=${supplierId}`).set(bearer(adminToken)).expect(200)).body as ListItem[];
      expect(received.map((o) => o.id)).toContain(first.id);
      expect(received.every((o) => o.status === 'received' && o.supplier.id === supplierId)).toBe(true);

      const pendingOther = (await api().get(`/api/purchase-orders?status=pending&supplierId=${otherSupplierId}`).set(bearer(adminToken)).expect(200)).body as ListItem[];
      expect(pendingOther.map((o) => o.id)).toContain(second.id);
      expect(pendingOther.map((o) => o.id)).not.toContain(first.id);
    });

    it('rejects invalid filters', async () => {
      await api().get('/api/purchase-orders?status=cancelled').set(bearer(adminToken)).expect(400);
      await api().get('/api/purchase-orders?supplierId=abc').set(bearer(adminToken)).expect(400);
    });
  });

  describe('GET /api/purchase-orders/:id', () => {
    it('returns the detail, 404 for a missing order and 400 for a bad id', async () => {
      const { variants: [a] } = await newProduct(10, [0]);
      const po = (await createPo({ supplierId, items: [{ variantId: a.id, qty: 1, costPrice: 9.99 }] }).expect(201)).body as PurchaseOrderBody;

      const res = await api().get(`/api/purchase-orders/${po.id}`).set(bearer(adminToken)).expect(200);
      expect(res.body).toEqual(po);
      await api().get(`/api/purchase-orders/${MISSING_ID}`).set(bearer(adminToken)).expect(404);
      await api().get('/api/purchase-orders/abc').set(bearer(adminToken)).expect(400);
    });
  });

  describe('POST /api/purchase-orders/:id/receive', () => {
    it('marks it received, adds stock, updates product cost and logs each stock change', async () => {
      const shoes = await newProduct(50, [2, 0]);
      const socks = await newProduct(3, [5]);
      const [a, b] = shoes.variants;
      const [c] = socks.variants;
      const po = (
        await createPo({
          supplierId,
          items: [
            { variantId: a.id, qty: 10, costPrice: 60 },
            { variantId: b.id, qty: 4, costPrice: 45 },
            { variantId: c.id, qty: 20, costPrice: 12.5 },
          ],
        }).expect(201)
      ).body as PurchaseOrderBody;

      const res = await receive(po.id).expect(200);
      expect(res.body).toMatchObject({ id: po.id, status: 'received', totalQty: 34 });

      expect([await stockOf(a.id), await stockOf(b.id), await stockOf(c.id)]).toEqual([12, 4, 25]);
      expect(await costOf(shoes.product.id)).toBe('55.71');
      expect(await costOf(socks.product.id)).toBe('12.50');

      const logs = await prisma.stockAdjustment.findMany({
        where: { variantId: { in: [a.id, b.id, c.id] } },
        orderBy: { variantId: 'asc' },
      });
      expect(logs.map((l) => [l.variantId, l.qtyChange, l.reason, l.userId])).toEqual([
        [a.id, 10, `Received purchase order #${po.id}`, adminId],
        [b.id, 4, `Received purchase order #${po.id}`, adminId],
        [c.id, 20, `Received purchase order #${po.id}`, adminId],
      ]);
    });

    it('refuses to receive twice and does not add stock again', async () => {
      const { variants: [a] } = await newProduct(10, [0]);
      const po = (await createPo({ supplierId, items: [{ variantId: a.id, qty: 5, costPrice: 8 }] }).expect(201)).body as PurchaseOrderBody;

      await receive(po.id).expect(200);
      const again = await receive(po.id).expect(409);
      expect(again.body.message).toBe(`Purchase order ${po.id} has already been received`);
      expect(await stockOf(a.id)).toBe(5);
      expect(await prisma.stockAdjustment.count({ where: { variantId: a.id } })).toBe(1);
    });

    it('adds stock only once when received twice at the same time', async () => {
      const { variants: [a] } = await newProduct(10, [1]);
      const po = (await createPo({ supplierId, items: [{ variantId: a.id, qty: 7, costPrice: 8 }] }).expect(201)).body as PurchaseOrderBody;

      const results = await Promise.all([receive(po.id), receive(po.id)]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await stockOf(a.id)).toBe(8);
    });

    it('returns 404 for a missing order and 403 for a cashier', async () => {
      const { variants: [a] } = await newProduct(10, [0]);
      const po = (await createPo({ supplierId, items: [{ variantId: a.id, qty: 1, costPrice: 1 }] }).expect(201)).body as PurchaseOrderBody;

      await receive(MISSING_ID).expect(404);
      await receive(po.id, cashierToken).expect(403);
      expect(await stockOf(a.id)).toBe(0);
    });
  });
});
