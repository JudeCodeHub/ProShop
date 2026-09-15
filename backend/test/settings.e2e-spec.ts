import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role, type Settings } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@settings-e2e.test';
const PASSWORD = 'correct-horse-9';

const DEFAULTS = {
  storeName: 'ProShop',
  address: null,
  logoUrl: null,
  taxRate: '0.00',
  currency: 'LKR',
  receiptFooterText: null,
};

describe('Settings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let cashierId: number;
  let categoryId: number;
  let variantId: number;
  let originalSettings: Settings | null;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const getSettings = (token = cashierToken) => api().get('/api/settings').set(bearer(token));
  const putSettings = (body: object, token = adminToken) =>
    api().put('/api/settings').set(bearer(token)).send(body);

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const sellOne = async () =>
    (
      (
        await api()
          .post('/api/orders')
          .set(bearer(cashierToken))
          .send({ items: [{ variantId, qty: 1 }], paymentMethod: 'card' })
          .expect(201)
      ).body as { id: number; taxRate: string; tax: string; total: string }
    );

  const receiptFor = async (orderId: number) =>
    (await api().get(`/api/orders/${orderId}/receipt`).set(bearer(cashierToken)).expect(200)).body as {
      store: { name: string; address: string | null; logoUrl: string | null; footer: string | null };
      currency: string;
      taxRate: string;
      tax: string;
    };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    originalSettings = await prisma.settings.findUnique({ where: { id: 1 } });
    await prisma.settings.deleteMany({ where: { id: 1 } });

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: { name: 'Set Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    });
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'Set Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E Settings ${run}` } }));
    const product = await prisma.product.create({
      data: { name: 'Settings Ball', categoryId, brand: 'Mikasa', costPrice: 50 },
    });
    ({ id: variantId } = await prisma.productVariant.create({
      data: { productId: product.id, size: '5', color: 'White', sku: `SET-${run}`, barcode: `SETBC-${run}`, sellPrice: 200, stockQty: 1000 },
    }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { cashierId } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await prisma.settings.deleteMany({ where: { id: 1 } });
    if (originalSettings) {
      await prisma.settings.create({ data: originalSettings });
    }
    await app.close();
  });

  describe('with no settings saved yet', () => {
    it('GET returns the defaults to any logged-in staff member without creating a row', async () => {
      expect((await getSettings().expect(200)).body).toEqual(DEFAULTS);
      expect((await getSettings(adminToken).expect(200)).body).toEqual(DEFAULTS);
      expect(await prisma.settings.count()).toBe(0);
      await api().get('/api/settings').expect(401);
    });

    it('checkout charges no tax and the receipt uses the default store name and currency', async () => {
      const order = await sellOne();
      expect(order).toMatchObject({ taxRate: '0.00', tax: '0.00', total: '200.00' });
      expect(await receiptFor(order.id)).toMatchObject({
        store: { name: 'ProShop', address: null, logoUrl: null, footer: null },
        currency: 'LKR',
      });
    });
  });

  describe('PUT /api/settings', () => {
    it('saves the settings, cleaning up text and upper-casing the currency', async () => {
      const res = await putSettings({
        storeName: '  ProShop Colombo  ',
        address: ' 12 Galle Road, Colombo 03 ',
        logoUrl: 'https://cdn.proshop.lk/logo.png',
        taxRate: 18,
        currency: 'lkr',
        receiptFooterText: ' Exchanges within 14 days ',
      }).expect(200);

      const saved = {
        storeName: 'ProShop Colombo',
        address: '12 Galle Road, Colombo 03',
        logoUrl: 'https://cdn.proshop.lk/logo.png',
        taxRate: '18.00',
        currency: 'LKR',
        receiptFooterText: 'Exchanges within 14 days',
      };
      expect(res.body).toEqual(saved);
      expect((await getSettings().expect(200)).body).toEqual(saved);
      expect(await prisma.settings.count()).toBe(1);
    });

    it('clears optional fields that are left out or sent empty', async () => {
      await putSettings({ storeName: 'Full', address: 'Somewhere', logoUrl: 'https://x.lk/a.png', taxRate: 5, currency: 'LKR', receiptFooterText: 'Hi' }).expect(200);
      const res = await putSettings({ storeName: 'Bare', taxRate: 5, currency: 'LKR', address: '   ', logoUrl: '' }).expect(200);
      expect(res.body).toEqual({ storeName: 'Bare', address: null, logoUrl: null, taxRate: '5.00', currency: 'LKR', receiptFooterText: null });
    });

    it('is admin only', async () => {
      await putSettings({ storeName: 'Nope', taxRate: 1, currency: 'LKR' }, cashierToken).expect(403);
      await api().put('/api/settings').send({}).expect(401);
    });

    it.each([
      ['a missing store name', { taxRate: 1, currency: 'LKR' }],
      ['an empty store name', { storeName: '  ', taxRate: 1, currency: 'LKR' }],
      ['a missing tax rate', { storeName: 'S', currency: 'LKR' }],
      ['a negative tax rate', { storeName: 'S', taxRate: -1, currency: 'LKR' }],
      ['a tax rate over 100', { storeName: 'S', taxRate: 100.01, currency: 'LKR' }],
      ['a tax rate with 3 decimals', { storeName: 'S', taxRate: 8.125, currency: 'LKR' }],
      ['a tax rate sent as text', { storeName: 'S', taxRate: '8', currency: 'LKR' }],
      ['an unknown currency', { storeName: 'S', taxRate: 1, currency: 'XYZ' }],
      ['a currency name', { storeName: 'S', taxRate: 1, currency: 'Rupees' }],
      ['a logo that is not a URL', { storeName: 'S', taxRate: 1, currency: 'LKR', logoUrl: 'logo.png' }],
      ['a non-http logo URL', { storeName: 'S', taxRate: 1, currency: 'LKR', logoUrl: 'ftp://x.lk/a.png' }],
      ['an unknown field', { storeName: 'S', taxRate: 1, currency: 'LKR', id: 2 }],
    ])('rejects %s', (_label, body) => putSettings(body).expect(400));
  });

  describe('checkout and receipts read the saved settings', () => {
    it('charges the saved tax rate and shows the saved store details and currency', async () => {
      await putSettings({
        storeName: 'ProShop Kandy',
        address: '5 Peradeniya Road',
        taxRate: 8,
        currency: 'USD',
        receiptFooterText: 'See you again',
      }).expect(200);

      const order = await sellOne();
      expect(order).toMatchObject({ taxRate: '8.00', tax: '16.00', total: '216.00' });
      expect(await receiptFor(order.id)).toMatchObject({
        store: { name: 'ProShop Kandy', address: '5 Peradeniya Road', footer: 'See you again' },
        currency: 'USD',
        taxRate: '8.00',
      });
    });

    it('applies a new tax rate to new sales but keeps old receipts at the rate they were sold with', async () => {
      await putSettings({ storeName: 'ProShop', taxRate: 10, currency: 'LKR' }).expect(200);
      const before = await sellOne();

      await putSettings({ storeName: 'ProShop', taxRate: 15, currency: 'LKR' }).expect(200);
      const after = await sellOne();

      expect(after).toMatchObject({ taxRate: '15.00', tax: '30.00' });
      expect(await receiptFor(before.id)).toMatchObject({ taxRate: '10.00', tax: '20.00' });
    });

    it('prices held orders with the saved tax rate too', async () => {
      await putSettings({ storeName: 'ProShop', taxRate: 12.5, currency: 'LKR' }).expect(200);
      const res = await api()
        .post('/api/orders/hold')
        .set(bearer(cashierToken))
        .send({ items: [{ variantId, qty: 1 }], paymentMethod: 'cash' })
        .expect(201);
      expect(res.body).toMatchObject({ taxRate: '12.50', tax: '25.00', total: '225.00' });
    });
  });
});
