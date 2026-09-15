import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role, type Settings } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@customers-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface CustomerBody {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
}

interface OrderBody {
  id: number;
  status: string;
  discount: string;
  total: string;
  pointsEarned: number;
  pointsRedeemed: number;
}

describe('Customers and loyalty (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  const tag = `C${run}`;
  let adminToken: string;
  let cashierToken: string;
  let cashierId: number;
  let categoryId: number;
  let variantId: number;
  let originalSettings: Settings | null;
  let phoneCounter = 0;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (path: string, body: object, token = cashierToken) => api().post(path).set(bearer(token)).send(body);
  const put = (path: string, body: object, token = adminToken) => api().put(path).set(bearer(token)).send(body);
  const get = (path: string, token = cashierToken) => api().get(path).set(bearer(token));

  const login = async (email: string) =>
    ((await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body as { accessToken: string })
      .accessToken;

  const uniquePhone = () => `07${String(run).slice(-6)}${String(++phoneCounter).padStart(2, '0')}`;

  const newCustomer = async (name = 'Loyal', points = 0) => {
    const customer = (await post('/api/customers', { name: `${name} ${tag}`, phone: uniquePhone() }).expect(201)).body as CustomerBody;
    if (points) {
      await prisma.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: points } });
    }
    return customer;
  };

  const balance = async (id: number) => (await prisma.customer.findUniqueOrThrow({ where: { id } })).loyaltyPoints;

  const sale = (body: object, status = 201, path = '/api/orders') =>
    post(path, { paymentMethod: 'cash', ...body }).expect(status).then((res) => res.body as OrderBody);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    originalSettings = await prisma.settings.findUnique({ where: { id: 1 } });
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, storeName: 'Loyalty Store', taxRate: 0 },
      update: { taxRate: 0 },
    });

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: { name: 'Cust Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    });
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'Cust Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E Customers ${run}` } }));
    const product = await prisma.product.create({
      data: { name: 'Loyalty Ball', categoryId, brand: 'Mikasa', costPrice: 40 },
    });
    ({ id: variantId } = await prisma.productVariant.create({
      data: { productId: product.id, size: '5', color: 'White', sku: `CUST-${run}`, barcode: `CUSTBC-${run}`, sellPrice: 100, stockQty: 10000 },
    }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { cashierId } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { name: { contains: tag } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    if (originalSettings) {
      await prisma.settings.update({ where: { id: 1 }, data: originalSettings });
    } else {
      await prisma.settings.deleteMany({ where: { id: 1 } });
    }
    await app.close();
  });

  describe('customer profiles', () => {
    it('lets a cashier add a customer, cleaning up the name, phone and email', async () => {
      const phone = uniquePhone();
      const spaced = `${phone.slice(0, 3)} ${phone.slice(3, 6)}-${phone.slice(6)}`;
      const res = await post('/api/customers', { name: `  Kamal Perera ${tag} `, phone: spaced, email: ` KAMAL.${run}@Example.COM ` }).expect(201);
      expect(res.body).toMatchObject({ name: `Kamal Perera ${tag}`, phone, email: `kamal.${run}@example.com`, loyaltyPoints: 0 });

      const bare = await post('/api/customers', { name: `Walk In ${tag}` }).expect(201);
      expect(bare.body).toMatchObject({ phone: null, email: null });
    });

    it('refuses a phone or email another customer already uses, however it is typed', async () => {
      const phone = uniquePhone();
      await post('/api/customers', { name: `First ${tag}`, phone, email: `dup.${run}@example.com` }).expect(201);

      const samePhone = await post('/api/customers', { name: `Second ${tag}`, phone: `${phone.slice(0, 3)} ${phone.slice(3)}` }).expect(409);
      expect(samePhone.body.message).toContain(`already uses the phone number ${phone}`);
      const sameEmail = await post('/api/customers', { name: `Third ${tag}`, email: `DUP.${run}@EXAMPLE.com` }).expect(409);
      expect(sameEmail.body.message).toContain(`already uses the email dup.${run}@example.com`);
    });

    it.each([
      ['a missing name', { phone: '0771112222' }],
      ['a phone with letters', { name: 'X', phone: 'call me' }],
      ['a phone that is too short', { name: 'X', phone: '12345' }],
      ['an invalid email', { name: 'X', email: 'not-an-email' }],
      ['a client-set points balance', { name: 'X', loyaltyPoints: 500 }],
    ])('rejects %s', (_label, body) => post('/api/customers', body).expect(400));

    it('lets an admin update a customer, clearing the email when it is left out', async () => {
      const customer = (await post('/api/customers', { name: `Edit Me ${tag}`, phone: uniquePhone(), email: `edit.${run}@example.com` }).expect(201)).body as CustomerBody;
      const res = await put(`/api/customers/${customer.id}`, { name: `Edited ${tag}`, phone: customer.phone! }).expect(200);
      expect(res.body).toMatchObject({ id: customer.id, name: `Edited ${tag}`, phone: customer.phone, email: null });

      const other = await newCustomer('Other');
      await put(`/api/customers/${customer.id}`, { name: 'x', phone: other.phone! }).expect(409);
      await put(`/api/customers/${customer.id}`, { name: 'x' }, cashierToken).expect(403);
      await put(`/api/customers/${MISSING_ID}`, { name: 'x' }).expect(404);
    });

    it('requires a login', () => api().get('/api/customers').expect(401));
  });

  describe('GET /api/customers', () => {
    it('searches by name, phone digits and email, with purchase stats', async () => {
      const phone = uniquePhone();
      const customer = (await post('/api/customers', { name: `Nimali Silva ${tag}`, phone, email: `nimali.${run}@shop.lk` }).expect(201)).body as CustomerBody;
      await sale({ customerId: customer.id, items: [{ variantId, qty: 2 }] });
      await sale({ customerId: customer.id, items: [{ variantId, qty: 1 }] });

      const find = async (search: string) =>
        ((await get(`/api/customers?search=${encodeURIComponent(search)}`).expect(200)).body as { items: (CustomerBody & { orderCount: number; totalSpent: string; lastPurchaseAt: string })[] }).items.filter((c) => c.name.includes(tag));

      expect((await find(`nimali silva ${tag}`)).map((c) => c.id)).toEqual([customer.id]);
      expect((await find(`${phone.slice(0, 3)} ${phone.slice(3, 7)}`)).map((c) => c.id)).toContain(customer.id);
      expect((await find(`nimali.${run}@SHOP`)).map((c) => c.id)).toEqual([customer.id]);

      const [row] = await find(`Nimali Silva ${tag}`);
      expect(row).toMatchObject({ orderCount: 2, totalSpent: '300.00', loyaltyPoints: 3 });
      expect(new Date(row.lastPurchaseAt).toString()).not.toBe('Invalid Date');
    });

    it('pages results and rejects bad queries', async () => {
      await newCustomer('Page A');
      await newCustomer('Page B');
      const res = await get(`/api/customers?search=${encodeURIComponent(`Page`)}&pageSize=1`).expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 1 });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBeGreaterThanOrEqual(2);

      await get('/api/customers?pageSize=101').expect(400);
      await get('/api/customers?search=%20').expect(400);
    });
  });

  describe('GET /api/customers/:id', () => {
    it('shows the profile with the full order history and completed-sale stats', async () => {
      const customer = await newCustomer('History');
      const first = await sale({ customerId: customer.id, items: [{ variantId, qty: 3 }] });
      const held = await sale({ customerId: customer.id, items: [{ variantId, qty: 1 }] }, 201, '/api/orders/hold');
      const voided = await sale({ customerId: customer.id, items: [{ variantId, qty: 1 }] });
      await post(`/api/orders/${voided.id}/void`, {}, adminToken).expect(200);

      const res = await get(`/api/customers/${customer.id}`).expect(200);
      expect(res.body).toMatchObject({ id: customer.id, orderCount: 1, totalSpent: '300.00', loyaltyPoints: 3 });
      expect(res.body.orders.map((o: { id: number; status: string }) => [o.id, o.status])).toEqual([
        [voided.id, 'voided'],
        [held.id, 'held'],
        [first.id, 'completed'],
      ]);
      expect(res.body.orders[2]).toMatchObject({ itemCount: 3, total: '300.00', pointsEarned: 3, pointsRedeemed: 0, returnCount: 0 });
    });

    it('returns 404 and 400', async () => {
      await get(`/api/customers/${MISSING_ID}`).expect(404);
      await get('/api/customers/abc').expect(400);
    });
  });

  describe('earning points', () => {
    it('awards 1 point per 100 spent on completed sales with a customer', async () => {
      const customer = await newCustomer('Earner');
      const order = await sale({ customerId: customer.id, items: [{ variantId, qty: 3 }], discount: 50 });
      expect(order).toMatchObject({ total: '250.00', pointsEarned: 2, pointsRedeemed: 0 });
      expect(await balance(customer.id)).toBe(2);

      const anonymous = await sale({ items: [{ variantId, qty: 5 }] });
      expect(anonymous.pointsEarned).toBe(0);
    });

    it('awards nothing when a sale is held and awards the points when it is resumed', async () => {
      const customer = await newCustomer('Holder');
      const held = await sale({ customerId: customer.id, items: [{ variantId, qty: 2 }] }, 201, '/api/orders/hold');
      expect(held.pointsEarned).toBe(0);
      expect(await balance(customer.id)).toBe(0);

      const resumed = (await post(`/api/orders/${held.id}/resume`, {}).expect(200)).body as OrderBody;
      expect(resumed.pointsEarned).toBe(2);
      expect(await balance(customer.id)).toBe(2);
    });

    it('takes earned points back when the sale is voided, never below zero', async () => {
      const customer = await newCustomer('Voider', 10);
      const order = await sale({ customerId: customer.id, items: [{ variantId, qty: 5 }] });
      expect(await balance(customer.id)).toBe(15);
      await post(`/api/orders/${order.id}/void`, {}, adminToken).expect(200);
      expect(await balance(customer.id)).toBe(10);

      const spender = await newCustomer('Spender');
      const spent = await sale({ customerId: spender.id, items: [{ variantId, qty: 5 }] });
      await prisma.customer.update({ where: { id: spender.id }, data: { loyaltyPoints: 2 } });
      await post(`/api/orders/${spent.id}/void`, {}, adminToken).expect(200);
      expect(await balance(spender.id)).toBe(0);
    });
  });

  describe('redeeming points', () => {
    it('converts points into a discount value without taking them', async () => {
      const customer = await newCustomer('Quote', 300);
      const res = await post(`/api/customers/${customer.id}/redeem-points`, { points: 120 }).expect(200);
      expect(res.body).toEqual({ customerId: customer.id, points: 120, discountValue: '120.00', balance: 300, balanceAfter: 180 });
      expect(await balance(customer.id)).toBe(300);

      const tooMany = await post(`/api/customers/${customer.id}/redeem-points`, { points: 301 }).expect(409);
      expect(tooMany.body.message).toBe(`Customer ${customer.id} has only 300 loyalty points`);
      await post(`/api/customers/${customer.id}/redeem-points`, { points: 0 }).expect(400);
      await post(`/api/customers/${MISSING_ID}/redeem-points`, { points: 1 }).expect(404);
    });

    it('takes the points when the sale completes, adds them to the discount and still earns on the new total', async () => {
      const customer = await newCustomer('Redeemer', 300);
      const order = await sale({ customerId: customer.id, items: [{ variantId, qty: 5 }], discount: 20, redeemPoints: 100 });
      expect(order).toMatchObject({ discount: '120.00', total: '380.00', pointsRedeemed: 100, pointsEarned: 3 });
      expect(await balance(customer.id)).toBe(203);

      await post(`/api/orders/${order.id}/void`, {}, adminToken).expect(200);
      expect(await balance(customer.id)).toBe(300);
    });

    it('refuses bad redemptions and changes nothing', async () => {
      const customer = await newCustomer('Careful', 50);
      const noCustomer = await post('/api/orders', { items: [{ variantId, qty: 1 }], paymentMethod: 'cash', redeemPoints: 10 }).expect(400);
      expect(noCustomer.body.message).toBe('Choose a customer to redeem loyalty points');

      const tooMany = await post('/api/orders', { customerId: customer.id, items: [{ variantId, qty: 1 }], paymentMethod: 'cash', redeemPoints: 51 }).expect(409);
      expect(tooMany.body.message).toBe(`Customer ${customer.id} has only 50 loyalty points`);

      const rich = await newCustomer('Rich', 500);
      const overSubtotal = await post('/api/orders', { customerId: rich.id, items: [{ variantId, qty: 1 }], paymentMethod: 'cash', redeemPoints: 101 }).expect(400);
      expect(overSubtotal.body.message).toBe('Discount 101.00 (including 101.00 from loyalty points) is more than the subtotal 100.00');

      const onHold = await post('/api/orders/hold', { customerId: rich.id, items: [{ variantId, qty: 1 }], paymentMethod: 'cash', redeemPoints: 10 }).expect(400);
      expect(onHold.body.message).toBe('Loyalty points can only be redeemed when completing a sale');

      expect([await balance(customer.id), await balance(rich.id)]).toEqual([50, 500]);
    });

    it('never spends the same points twice when two sales redeem them together', async () => {
      const customer = await newCustomer('Racer', 100);
      const body = { customerId: customer.id, items: [{ variantId, qty: 1 }], paymentMethod: 'cash', redeemPoints: 100 };
      const results = await Promise.all([post('/api/orders', body), post('/api/orders', body)]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await balance(customer.id)).toBe(0);
    });
  });
});
