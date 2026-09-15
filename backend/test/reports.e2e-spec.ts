import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { todayInStore } from './../src/common/store-time.js';
import { OrderStatus, Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@reports-e2e.test';
const PASSWORD = 'correct-horse-9';
const MARCH = 'from=2020-03-01&to=2020-03-31';

type Line = [variantId: number, qty: number, price: number];

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  const nike = `Nike${run}`;
  const adidas = `Adidas${run}`;
  let adminToken: string;
  let cashierToken: string;
  let adminId: number;
  let cashierA: number;
  let cashierB: number;
  let footwearId: number;
  let apparelId: number;
  let shoe42: { id: number; sku: string };
  let shoe43: { id: number; sku: string };
  let shirt: { id: number; sku: string };

  const api = () => request(app.getHttpServer());
  const report = (path: string, token = adminToken) =>
    api().get(`/api/reports/${path}`).set('Authorization', `Bearer ${token}`);

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const order = (
    cashierId: number,
    createdAt: string,
    status: OrderStatus,
    lines: Line[],
    discount = 0,
    tax = 0,
  ) => {
    const gross = lines.reduce((n, [, qty, price]) => n + qty * price, 0);
    return prisma.order.create({
      data: {
        cashierId,
        createdAt: new Date(createdAt),
        status,
        paymentMethod: 'cash',
        discount,
        tax,
        total: gross - discount + tax,
        items: {
          create: lines.map(([variantId, qty, priceAtSale]) => ({ variantId, qty, priceAtSale })),
        },
      },
    });
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    const user = (name: string, prefix: string, role: Role) =>
      prisma.user.create({ data: { name, email: `${prefix}-${run}${EMAIL_DOMAIN}`, password, role } });
    ({ id: adminId } = await user('Rep Admin', 'admin', Role.admin));
    ({ id: cashierA } = await user('Rep Anura', 'cashier-a', Role.cashier));
    ({ id: cashierB } = await user('Rep Bimal', 'cashier-b', Role.cashier));

    ({ id: footwearId } = await prisma.category.create({ data: { name: `E2E Rep Footwear ${run}` } }));
    ({ id: apparelId } = await prisma.category.create({ data: { name: `E2E Rep Apparel ${run}` } }));
    const shoe = await prisma.product.create({
      data: { name: 'Rep Runner', categoryId: footwearId, brand: nike, costPrice: 60 },
    });
    const tee = await prisma.product.create({
      data: { name: 'Rep Tee', categoryId: apparelId, brand: adidas, costPrice: 10 },
    });
    const variant = (productId: number, size: string, sellPrice: number, stockQty: number) =>
      prisma.productVariant.create({
        data: { productId, size, color: 'Black', sku: `REP-${run}-${size}`, barcode: `REPBC-${run}-${size}`, sellPrice, stockQty },
        select: { id: true, sku: true },
      });
    shoe42 = await variant(shoe.id, '42', 100, 5);
    shoe43 = await variant(shoe.id, '43', 100, 2);
    shirt = await variant(tee.id, 'M', 25, 10);

    await order(cashierA, '2020-02-29T20:00:00Z', OrderStatus.completed, [[shoe43.id, 1, 100]]);
    await order(cashierA, '2020-03-02T04:00:00Z', OrderStatus.completed, [[shoe42.id, 2, 100], [shirt.id, 1, 25]], 25, 30);
    await order(cashierB, '2020-03-02T20:00:00Z', OrderStatus.completed, [[shoe42.id, 1, 100]]);
    await order(cashierB, '2020-03-05T06:00:00Z', OrderStatus.voided, [[shoe43.id, 3, 100]]);
    await order(cashierA, '2020-03-06T06:00:00Z', OrderStatus.held, [[shoe43.id, 1, 100]]);
    await order(cashierA, '2020-03-10T06:00:00Z', OrderStatus.completed, [[shirt.id, 4, 25]], 0, 15);
    await order(cashierA, '2020-03-31T19:00:00Z', OrderStatus.completed, [[shoe42.id, 1, 100]]);

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-a-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { cashierId: { in: [adminId, cashierA, cashierB] } } });
    await prisma.product.deleteMany({ where: { categoryId: { in: [footwearId, apparelId] } } });
    await prisma.category.deleteMany({ where: { id: { in: [footwearId, apparelId] } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('access and validation', () => {
    const paths = [
      'sales-summary',
      'best-sellers',
      'revenue-by-category',
      'staff-performance',
      'stock-valuation',
      'profit-margin',
    ];

    it('is admin only on every report', async () => {
      for (const path of paths) {
        await api().get(`/api/reports/${path}`).expect(401);
        await report(path, cashierToken).expect(403);
      }
    });

    it.each([
      ['from after to', 'sales-summary?from=2020-03-02&to=2020-03-01'],
      ['an impossible date', 'profit-margin?from=2020-02-30'],
      ['a non-date', 'staff-performance?from=yesterday'],
      ['a range over 10 years', 'best-sellers?from=2000-01-01&to=2020-01-01'],
      ['an unknown period', 'sales-summary?period=yearly'],
      ['a zero limit', 'best-sellers?limit=0'],
      ['a limit over 100', 'best-sellers?limit=101'],
      ['an unknown grouping', 'revenue-by-category?by=color'],
      ['an unknown parameter', 'profit-margin?store=1'],
    ])('rejects %s', (_label, path) => report(path).expect(400));
  });

  describe('GET /api/reports/sales-summary', () => {
    it('groups completed sales by store-local day, fills empty days and ignores voided and held orders', async () => {
      const res = await report('sales-summary?period=daily&from=2020-03-01&to=2020-03-05').expect(200);
      const zero = { orders: 0, itemsSold: 0, grossSales: '0.00', discounts: '0.00', netSales: '0.00', tax: '0.00', total: '0.00' };

      expect(res.body).toEqual({
        period: 'daily',
        from: '2020-03-01',
        to: '2020-03-05',
        timeZone: 'Asia/Colombo',
        buckets: [
          { periodStart: '2020-03-01', orders: 1, itemsSold: 1, grossSales: '100.00', discounts: '0.00', netSales: '100.00', tax: '0.00', total: '100.00' },
          { periodStart: '2020-03-02', orders: 1, itemsSold: 3, grossSales: '225.00', discounts: '25.00', netSales: '200.00', tax: '30.00', total: '230.00' },
          { periodStart: '2020-03-03', orders: 1, itemsSold: 1, grossSales: '100.00', discounts: '0.00', netSales: '100.00', tax: '0.00', total: '100.00' },
          { periodStart: '2020-03-04', ...zero },
          { periodStart: '2020-03-05', ...zero },
        ],
        totals: { orders: 3, itemsSold: 5, grossSales: '425.00', discounts: '25.00', netSales: '400.00', tax: '30.00', total: '430.00' },
      });
    });

    it('groups by week starting Monday', async () => {
      const res = await report(`sales-summary?period=weekly&${MARCH}`).expect(200);
      const buckets = res.body.buckets as { periodStart: string; orders: number; netSales: string }[];
      expect(buckets.map((b) => [b.periodStart, b.orders, b.netSales])).toEqual([
        ['2020-02-24', 1, '100.00'],
        ['2020-03-02', 2, '300.00'],
        ['2020-03-09', 1, '100.00'],
        ['2020-03-16', 0, '0.00'],
        ['2020-03-23', 0, '0.00'],
        ['2020-03-30', 0, '0.00'],
      ]);
    });

    it('groups by month', async () => {
      const res = await report('sales-summary?period=monthly&from=2020-03-01&to=2020-04-30').expect(200);
      const buckets = res.body.buckets as { periodStart: string; orders: number; netSales: string }[];
      expect(buckets.map((b) => [b.periodStart, b.orders, b.netSales])).toEqual([
        ['2020-03-01', 4, '500.00'],
        ['2020-04-01', 1, '100.00'],
      ]);
    });

    it('defaults to the last 30 days, 12 weeks or 12 months ending today', async () => {
      const today = todayInStore();
      const daily = (await report('sales-summary').expect(200)).body;
      expect(daily.period).toBe('daily');
      expect(daily.to).toBe(today);
      expect(daily.buckets).toHaveLength(30);
      expect(daily.buckets.at(-1).periodStart).toBe(today);

      expect((await report('sales-summary?period=weekly').expect(200)).body.buckets).toHaveLength(12);
      expect((await report('sales-summary?period=monthly').expect(200)).body.buckets).toHaveLength(12);
    });
  });

  describe('GET /api/reports/best-sellers', () => {
    it('ranks variants by units sold with discount-adjusted revenue', async () => {
      const res = await report(`best-sellers?${MARCH}`).expect(200);
      expect(res.body).toMatchObject({ from: '2020-03-01', to: '2020-03-31', limit: 10 });
      expect(res.body.items).toEqual([
        { variantId: shirt.id, sku: shirt.sku, productName: 'Rep Tee', brand: adidas, category: `E2E Rep Apparel ${run}`, size: 'M', color: 'Black', unitsSold: 5, revenue: '122.22', stockLeft: 10 },
        { variantId: shoe42.id, sku: shoe42.sku, productName: 'Rep Runner', brand: nike, category: `E2E Rep Footwear ${run}`, size: '42', color: 'Black', unitsSold: 3, revenue: '277.78', stockLeft: 5 },
        { variantId: shoe43.id, sku: shoe43.sku, productName: 'Rep Runner', brand: nike, category: `E2E Rep Footwear ${run}`, size: '43', color: 'Black', unitsSold: 1, revenue: '100.00', stockLeft: 2 },
      ]);
    });

    it('respects the limit', async () => {
      const res = await report(`best-sellers?${MARCH}&limit=2`).expect(200);
      expect((res.body.items as { variantId: number }[]).map((i) => i.variantId)).toEqual([shirt.id, shoe42.id]);
    });
  });

  describe('GET /api/reports/revenue-by-category', () => {
    it('splits net revenue by category with each share', async () => {
      const res = await report(`revenue-by-category?${MARCH}`).expect(200);
      expect(res.body).toEqual({
        from: '2020-03-01',
        to: '2020-03-31',
        by: 'category',
        totalRevenue: '500.00',
        rows: [
          { categoryId: footwearId, name: `E2E Rep Footwear ${run}`, unitsSold: 4, revenue: '377.78', sharePercent: '75.56' },
          { categoryId: apparelId, name: `E2E Rep Apparel ${run}`, unitsSold: 5, revenue: '122.22', sharePercent: '24.44' },
        ],
      });
    });

    it('can group by brand instead', async () => {
      const res = await report(`revenue-by-category?${MARCH}&by=brand`).expect(200);
      expect(res.body.rows).toEqual([
        { categoryId: null, name: nike, unitsSold: 4, revenue: '377.78', sharePercent: '75.56' },
        { categoryId: null, name: adidas, unitsSold: 5, revenue: '122.22', sharePercent: '24.44' },
      ]);
    });
  });

  describe('GET /api/reports/staff-performance', () => {
    it('attributes completed sales and voids to each staff member', async () => {
      const res = await report(`staff-performance?${MARCH}`).expect(200);
      const ours = (res.body.staff as { userId: number }[]).filter((s) => [adminId, cashierA, cashierB].includes(s.userId));

      expect(ours).toEqual([
        { userId: cashierA, name: 'Rep Anura', role: 'cashier', orders: 3, itemsSold: 8, netSales: '400.00', total: '445.00', averageSale: '133.33', voidedOrders: 0 },
        { userId: cashierB, name: 'Rep Bimal', role: 'cashier', orders: 1, itemsSold: 1, netSales: '100.00', total: '100.00', averageSale: '100.00', voidedOrders: 1 },
        { userId: adminId, name: 'Rep Admin', role: 'admin', orders: 0, itemsSold: 0, netSales: '0.00', total: '0.00', averageSale: null, voidedOrders: 0 },
      ]);
    });
  });

  describe('GET /api/reports/stock-valuation', () => {
    it('values current stock at cost and at retail per category', async () => {
      const res = await report('stock-valuation').expect(200);
      const rows = res.body.byCategory as { categoryId: number }[];

      expect(rows.find((r) => r.categoryId === footwearId)).toEqual({
        categoryId: footwearId, name: `E2E Rep Footwear ${run}`, units: 7, costValue: '420.00', retailValue: '700.00',
      });
      expect(rows.find((r) => r.categoryId === apparelId)).toEqual({
        categoryId: apparelId, name: `E2E Rep Apparel ${run}`, units: 10, costValue: '100.00', retailValue: '250.00',
      });
      expect(res.body.totalUnits).toBeGreaterThanOrEqual(17);
      expect(Number(res.body.costValue)).toBeGreaterThanOrEqual(520);
    });
  });

  describe('GET /api/reports/profit-margin', () => {
    it('compares net revenue with cost for the range', async () => {
      const res = await report(`profit-margin?${MARCH}`).expect(200);
      expect(res.body).toEqual({
        from: '2020-03-01',
        to: '2020-03-31',
        unitsSold: 9,
        netSales: '500.00',
        cost: '290.00',
        grossProfit: '210.00',
        marginPercent: '42.00',
      });
    });

    it('returns zeros and no margin when nothing was sold', async () => {
      const res = await report('profit-margin?from=2019-01-01&to=2019-01-02').expect(200);
      expect(res.body).toEqual({
        from: '2019-01-01',
        to: '2019-01-02',
        unitsSold: 0,
        netSales: '0.00',
        cost: '0.00',
        grossProfit: '0.00',
        marginPercent: null,
      });
    });
  });
});
