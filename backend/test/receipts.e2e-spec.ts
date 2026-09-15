import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role, type Settings } from './../src/generated/prisma/client.js';
import { receiptNumber } from './../src/orders/receipts/receipt.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@receipts-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Receipts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let cashierId: number;
  let categoryId: number;
  let customerId: number;
  let shoeId: number;
  let bagId: number;
  let originalSettings: Settings | null;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const sale = async (withCustomer = false) =>
    (
      (
        await api()
          .post('/api/orders')
          .set(bearer(cashierToken))
          .send({
            customerId: withCustomer ? customerId : undefined,
            items: [
              { variantId: shoeId, qty: 3 },
              { variantId: bagId, qty: 1 },
            ],
            discount: 10,
            paymentMethod: 'cash',
          })
          .expect(201)
      ).body as { id: number }
    ).id;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    originalSettings = await prisma.settings.findUnique({ where: { id: 1 } });
    const store = {
      storeName: 'ProShop Colombo',
      address: '12 Galle Road, Colombo 03',
      receiptFooterText: 'Thank you! Exchanges within 14 days.',
      currency: 'LKR',
      taxRate: 15,
    };
    await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, ...store }, update: store });

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: { name: 'R Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    });
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'R Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E Receipts ${run}` } }));
    const product = await prisma.product.create({
      data: { name: 'Pro Runner', categoryId, brand: 'Asics', costPrice: 80 },
    });
    ({ id: shoeId } = await prisma.productVariant.create({
      data: { productId: product.id, size: '42', color: 'Black', sku: `RCP-${run}-1`, barcode: `RCPBC-${run}-1`, sellPrice: '19.99', stockQty: 1000 },
    }));
    ({ id: bagId } = await prisma.productVariant.create({
      data: { productId: product.id, size: 'One', color: 'Red', sku: `RCP-${run}-2`, barcode: `RCPBC-${run}-2`, sellPrice: '150.00', stockQty: 1000 },
    }));
    ({ id: customerId } = await prisma.customer.create({ data: { name: 'Kamal Perera' } }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { cashierId } });
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

  describe('GET /api/orders/:id/receipt', () => {
    it('returns the full receipt with store info, items, tax, discount, total and payment method', async () => {
      const orderId = await sale(true);
      const res = await api().get(`/api/orders/${orderId}/receipt`).set(bearer(cashierToken)).expect(200);

      expect(res.body).toMatchObject({
        receiptNumber: receiptNumber(orderId),
        orderId,
        status: 'completed',
        store: {
          name: 'ProShop Colombo',
          address: '12 Galle Road, Colombo 03',
          footer: 'Thank you! Exchanges within 14 days.',
        },
        cashier: 'R Cashier',
        customer: { name: 'Kamal Perera' },
        items: [
          { name: 'Pro Runner', variant: '42 / Black', qty: 3, unitPrice: '19.99', lineTotal: '59.97' },
          { name: 'Pro Runner', variant: 'One / Red', qty: 1, unitPrice: '150.00', lineTotal: '150.00' },
        ],
        currency: 'LKR',
        subtotal: '209.97',
        discount: '10.00',
        taxRate: '15.00',
        tax: '30.00',
        total: '229.97',
        paymentMethod: 'cash',
      });
      expect(new Date(res.body.issuedAt).toString()).not.toBe('Invalid Date');
    });

    it('uses current store info but keeps the tax rate the order was sold with', async () => {
      const orderId = await sale();
      await prisma.settings.update({ where: { id: 1 }, data: { storeName: 'ProShop Kandy', taxRate: 8 } });
      try {
        const res = await api().get(`/api/orders/${orderId}/receipt`).set(bearer(adminToken)).expect(200);
        expect(res.body).toMatchObject({ store: { name: 'ProShop Kandy' }, taxRate: '15.00', tax: '30.00', customer: null });
      } finally {
        await prisma.settings.update({ where: { id: 1 }, data: { storeName: 'ProShop Colombo', taxRate: 15 } });
      }
    });

    it('shows the status of voided orders', async () => {
      const orderId = await sale();
      await api().post(`/api/orders/${orderId}/void`).set(bearer(adminToken)).expect(200);
      const res = await api().get(`/api/orders/${orderId}/receipt`).set(bearer(cashierToken)).expect(200);
      expect(res.body.status).toBe('voided');
    });

    it('returns 404, 400 and 401 for missing, bad and unauthenticated requests', async () => {
      await api().get(`/api/orders/${MISSING_ID}/receipt`).set(bearer(cashierToken)).expect(404);
      await api().get('/api/orders/abc/receipt').set(bearer(cashierToken)).expect(400);
      await api().get(`/api/orders/${MISSING_ID}/receipt`).expect(401);
    });
  });

  describe('GET /api/orders/:id/receipt/pdf', () => {
    it('returns a PDF shown inline with the receipt number as the filename', async () => {
      const orderId = await sale(true);
      const res = await api()
        .get(`/api/orders/${orderId}/receipt/pdf`)
        .set(bearer(cashierToken))
        .buffer(true)
        .parse(binary)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(`inline; filename="receipt-${receiptNumber(orderId)}.pdf"`);
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(Number(res.headers['content-length'])).toBe(pdf.length);
    });

    it('works for a voided order and returns 404 for a missing one', async () => {
      const orderId = await sale();
      await api().post(`/api/orders/${orderId}/void`).set(bearer(adminToken)).expect(200);
      await api().get(`/api/orders/${orderId}/receipt/pdf`).set(bearer(cashierToken)).buffer(true).parse(binary).expect(200);
      await api().get(`/api/orders/${MISSING_ID}/receipt/pdf`).set(bearer(cashierToken)).expect(404);
    });

    it('no longer offers an email route', () =>
      api().post(`/api/orders/${MISSING_ID}/receipt/email`).set(bearer(cashierToken)).expect(404));
  });
});
