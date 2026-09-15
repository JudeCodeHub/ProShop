import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { OrderStatus, Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@history-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;
const RANGE = 'from=2020-02-01&to=2020-03-31';

interface ListBody {
  page: number;
  pageSize: number;
  total: number;
  items: {
    id: number;
    status: string;
    paymentMethod: string;
    cashier: { id: number; name: string };
    customer: { id: number; name: string } | null;
    itemCount: number;
    total: string;
    returnCount: number;
  }[];
}

describe('Order history (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let adminId: number;
  let cashierA: number;
  let cashierB: number;
  let categoryId: number;
  let customerId: number;
  let productId: number;
  let shoe42: number;
  let shoe43: number;
  const o: Record<'feb29' | 'mar2Early' | 'mar2Held' | 'mar3Voided', number> = {} as never;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = async (query: string, token = adminToken) =>
    (await api().get(`/api/orders?${query}`).set(bearer(token)).expect(200)).body as ListBody;
  const ids = async (query: string) => (await list(query)).items.map((item) => item.id);

  const login = async (email: string) =>
    ((await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body as { accessToken: string })
      .accessToken;

  const order = (cashierId: number, createdAt: string, status: OrderStatus, qty: number, withCustomer = false) =>
    prisma.order
      .create({
        data: {
          cashierId,
          customerId: withCustomer ? customerId : undefined,
          createdAt: new Date(createdAt),
          status,
          paymentMethod: 'card',
          total: qty * 100,
          items: { create: { variantId: shoe42, qty, priceAtSale: 100 } },
        },
      })
      .then((created) => created.id);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    const user = (name: string, prefix: string, role: Role) =>
      prisma.user.create({ data: { name, email: `${prefix}-${run}${EMAIL_DOMAIN}`, password, role } }).then((u) => u.id);
    adminId = await user('Hist Admin', 'admin', Role.admin);
    cashierA = await user('Hist Anura', 'cashier-a', Role.cashier);
    cashierB = await user('Hist Bimal', 'cashier-b', Role.cashier);

    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E History ${run}` } }));
    ({ id: customerId } = await prisma.customer.create({ data: { name: 'Hist Customer' } }));
    ({ id: productId } = await prisma.product.create({
      data: { name: 'History Shoe', categoryId, brand: 'Puma', costPrice: 40 },
    }));
    ({ id: shoe42 } = await prisma.productVariant.create({
      data: { productId, size: '42', color: 'Red', sku: `HIST-${run}-42`, barcode: `HISTBC-${run}-42`, sellPrice: 100, stockQty: 20 },
    }));
    ({ id: shoe43 } = await prisma.productVariant.create({
      data: { productId, size: '43', color: 'Red', sku: `HIST-${run}-43`, barcode: `HISTBC-${run}-43`, sellPrice: 100, stockQty: 20 },
    }));

    o.feb29 = await order(cashierA, '2020-02-29T10:00:00Z', OrderStatus.completed, 1);
    o.mar2Early = await order(cashierA, '2020-03-01T20:00:00Z', OrderStatus.completed, 2, true);
    o.mar2Held = await order(cashierB, '2020-03-02T10:00:00Z', OrderStatus.held, 1);
    o.mar3Voided = await order(cashierA, '2020-03-03T10:00:00Z', OrderStatus.voided, 3);

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-a-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.stockAdjustment.deleteMany({ where: { userId: adminId } });
    await prisma.return.deleteMany({ where: { order: { cashierId: { in: [cashierA, cashierB] } } } });
    await prisma.order.deleteMany({ where: { cashierId: { in: [cashierA, cashierB] } } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('GET /api/orders', () => {
    it('lists orders newest first with cashier, customer, item count, total and return count', async () => {
      const body = await list(RANGE);
      expect(body).toMatchObject({ page: 1, pageSize: 25, total: 4 });
      expect(body.items.map((item) => item.id)).toEqual([o.mar3Voided, o.mar2Held, o.mar2Early, o.feb29]);
      expect(body.items[2]).toEqual({
        id: o.mar2Early,
        createdAt: '2020-03-01T20:00:00.000Z',
        status: 'completed',
        paymentMethod: 'card',
        cashier: { id: cashierA, name: 'Hist Anura' },
        customer: { id: customerId, name: 'Hist Customer' },
        itemCount: 2,
        total: '200.00',
        returnCount: 0,
      });
    });

    it('filters by store-local dates, including sales just after midnight', async () => {
      expect(await ids('from=2020-03-02&to=2020-03-02')).toEqual([o.mar2Held, o.mar2Early]);
      expect(await ids('from=2020-03-01&to=2020-03-01')).toEqual([]);
      expect(await ids('from=2020-02-29&to=2020-02-29')).toEqual([o.feb29]);
      expect(await ids('from=2020-03-03&to=2020-03-31')).toEqual([o.mar3Voided]);
    });

    it('filters by cashier and status', async () => {
      expect(await ids(`${RANGE}&cashierId=${cashierB}`)).toEqual([o.mar2Held]);
      expect(await ids(`${RANGE}&status=voided`)).toEqual([o.mar3Voided]);
      expect(await ids(`${RANGE}&status=completed&cashierId=${cashierA}`)).toEqual([o.mar2Early, o.feb29]);
    });

    it('pages through results', async () => {
      const first = await list(`${RANGE}&pageSize=3`);
      const second = await list(`${RANGE}&pageSize=3&page=2`);
      expect([first.total, first.items.length, second.items.length]).toEqual([4, 3, 1]);
      expect(second.items[0].id).toBe(o.feb29);
      expect((await list(`${RANGE}&pageSize=3&page=9`)).items).toEqual([]);
    });

    it('rejects bad filters and non-admins', async () => {
      for (const query of ['from=2020-03-02&to=2020-03-01', 'status=refunded', 'pageSize=101', 'page=0', 'cashierId=abc', 'from=2020-02-30', 'sort=total']) {
        await api().get(`/api/orders?${query}`).set(bearer(adminToken)).expect(400);
      }
      await api().get('/api/orders').set(bearer(cashierToken)).expect(403);
      await api().get('/api/orders').expect(401);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('shows the order with product ids and no returns yet', async () => {
      const res = await api().get(`/api/orders/${o.mar2Early}`).set(bearer(adminToken)).expect(200);
      expect(res.body).toMatchObject({
        id: o.mar2Early,
        status: 'completed',
        paymentMethod: 'card',
        cashier: { id: cashierA },
        customer: { id: customerId },
        subtotal: '200.00',
        total: '200.00',
        returns: [],
      });
      expect(res.body.items).toEqual([
        expect.objectContaining({ variantId: shoe42, productId, qty: 2, returnedQty: 0, unitPrice: '100.00', lineTotal: '200.00' }),
      ]);
    });

    it('shows returned quantities and the return and exchange history linked to the sale', async () => {
      await api()
        .post('/api/returns')
        .set(bearer(adminToken))
        .send({ orderId: o.mar2Early, variantId: shoe42, qty: 1, reason: 'Too tight' })
        .expect(201);
      await api()
        .post('/api/exchanges')
        .set(bearer(adminToken))
        .send({ orderId: o.mar2Early, originalVariantId: shoe42, newVariantId: shoe43, qty: 1 })
        .expect(201);

      const res = await api().get(`/api/orders/${o.mar2Early}`).set(bearer(adminToken)).expect(200);
      expect(res.body.items[0].returnedQty).toBe(2);
      expect(res.body.returns).toEqual([
        expect.objectContaining({ type: 'exchange', variantId: shoe42, qty: 1, refundAmount: '0.00', amountDue: '0.00', exchangeItem: { sku: `HIST-${run}-43`, size: '43', color: 'Red' }, processedBy: { id: adminId, name: 'Hist Admin' } }),
        expect.objectContaining({ type: 'return', qty: 1, reason: 'Too tight', refundAmount: '100.00', exchangeItem: null }),
      ]);

      const listed = (await list(`from=2020-03-02&to=2020-03-02&cashierId=${cashierA}`)).items[0];
      expect(listed.returnCount).toBe(2);
    });

    it('returns 404 for a missing order, 400 for a bad id and 403 for a cashier', async () => {
      await api().get(`/api/orders/${MISSING_ID}`).set(bearer(adminToken)).expect(404);
      await api().get('/api/orders/abc').set(bearer(adminToken)).expect(400);
      await api().get(`/api/orders/${o.feb29}`).set(bearer(cashierToken)).expect(403);
    });

    it('still lets cashiers list their held orders', async () => {
      await api().get('/api/orders/held').set(bearer(cashierToken)).expect(200);
    });
  });

  describe('GET /api/users', () => {
    it('lists staff with their role and never the password', async () => {
      const res = await api().get('/api/users').set(bearer(adminToken)).expect(200);
      const ours = (res.body as { id: number; name: string; role: string }[]).filter((u) => [adminId, cashierA, cashierB].includes(u.id));
      expect(ours.map((u) => [u.name, u.role])).toEqual([
        ['Hist Admin', 'admin'],
        ['Hist Anura', 'cashier'],
        ['Hist Bimal', 'cashier'],
      ]);
      expect(res.body[0]).not.toHaveProperty('password');
      await api().get('/api/users').set(bearer(cashierToken)).expect(403);
    });
  });
});
