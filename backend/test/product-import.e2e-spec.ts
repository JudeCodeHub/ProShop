import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@import-e2e.test';
const PASSWORD = 'correct-horse-9';
const HEADER = 'name,category,brand,costPrice,size,color,sellPrice,stockQty';

interface Summary {
  processed: number;
  created: number;
  skipped: number;
  categoriesCreated: number;
  productsCreated: number;
  errors: { row: number; messages: string[] }[];
}

describe('Product bulk import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  const brandPrefix = `ImportBrand${run}`;
  const categoryPrefix = `E2E Import ${run}`;
  let adminToken: string;
  let cashierToken: string;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const unique = () => `${run}-${++counter}`;

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const upload = (csv: string | Buffer, filename = 'products.csv', token = adminToken) =>
    api()
      .post('/api/products/bulk-import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.isBuffer(csv) ? csv : Buffer.from(csv), filename);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.createMany({
      data: [
        { name: 'Imp Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
        { name: 'Imp Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
      ],
    });
    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { brand: { startsWith: brandPrefix, mode: 'insensitive' } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: categoryPrefix, mode: 'insensitive' } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('access and file checks', () => {
    it('requires an admin', async () => {
      await api().post('/api/products/bulk-import').attach('file', Buffer.from(HEADER), 'p.csv').expect(401);
      await upload(HEADER, 'p.csv', cashierToken).expect(403);
    });

    it('rejects a request without a file', () =>
      api().post('/api/products/bulk-import').set('Authorization', `Bearer ${adminToken}`).expect(400));

    it('rejects a file that is not .csv', async () => {
      const res = await upload(`${HEADER}\nA,B,C,1,M,Red,2,3`, 'products.xlsx').expect(400);
      expect(res.body.message).toBe('Only .csv files are accepted');
    });

    it('rejects an empty file, a header-only file and missing columns', async () => {
      expect((await upload('', 'empty.csv').expect(400)).body.message).toBe('The CSV file is empty');
      expect((await upload(`${HEADER}\n`).expect(400)).body.message).toBe('The CSV file has no data rows');
      expect((await upload('name,category,brand,size\nA,B,C,M').expect(400)).body.message).toBe(
        'Missing columns: costPrice, color, sellPrice, stockQty',
      );
    });

    it('rejects a broken CSV', async () => {
      const res = await upload(`${HEADER}\n"unclosed,B,C,1,M,Red,2,3`).expect(400);
      expect(res.body.message).toContain('Could not read the CSV file');
    });

    it('rejects more than 5000 rows before importing anything', async () => {
      const brand = `${brandPrefix}-big`;
      const rows = Array.from({ length: 5001 }, (_, i) => `P${i},${categoryPrefix} Big,${brand},1,M,Red,2,3`);
      const res = await upload([HEADER, ...rows].join('\n')).expect(400);
      expect(res.body.message).toBe('The CSV file has 5001 rows; the limit is 5000');
      expect(await prisma.product.count({ where: { brand } })).toBe(0);
    });

    it('rejects files over 2 MB with 413', () =>
      upload(Buffer.alloc(2 * 1024 * 1024 + 1, 'a'), 'huge.csv').expect(413));
  });

  describe('importing rows', () => {
    it('creates categories, products and variants, reusing existing ones', async () => {
      const id = unique();
      const brand = `${brandPrefix}-${id}`;
      const existingCategory = await prisma.category.create({ data: { name: `${categoryPrefix} Apparel ${id}` } });
      const csv = [
        `﻿ Name , CATEGORY,brand,CostPrice,size,color,sellPrice,stockQty`,
        `Air Zoom,${categoryPrefix} Footwear ${id},${brand},120.50,42,Black,150,10`,
        `air zoom,${categoryPrefix} FOOTWEAR ${id},${brand.toUpperCase()},120.50,43,Black,150,`,
        '',
        `"Tee, Classic",${existingCategory.name.toLowerCase()},${brand},8,M,White,20,5`,
      ].join('\n');

      const summary = (await upload(csv).expect(200)).body as Summary;
      expect(summary).toEqual({
        processed: 3,
        created: 3,
        skipped: 0,
        categoriesCreated: 1,
        productsCreated: 2,
        errors: [],
      });

      const products = await prisma.product.findMany({
        where: { brand: { equals: brand, mode: 'insensitive' } },
        include: { category: true, variants: { orderBy: { size: 'asc' } } },
        orderBy: { name: 'asc' },
      });
      expect(products.map((p) => [p.name, p.category.name])).toEqual([
        ['Air Zoom', `${categoryPrefix} Footwear ${id}`],
        ['Tee, Classic', existingCategory.name],
      ]);
      const shoe = products[0];
      expect(shoe.variants.map((v) => [v.size, v.stockQty, v.sku])).toEqual([
        ['42', 10, `PROD-${shoe.id}-42-BLACK`],
        ['43', 0, `PROD-${shoe.id}-43-BLACK`],
      ]);
      expect(shoe.variants.every((v) => /^200\d{10}$/.test(v.barcode))).toBe(true);
    });

    it('skips bad rows with their line numbers and still imports the good ones', async () => {
      const id = unique();
      const brand = `${brandPrefix}-${id}`;
      const shoes = `${categoryPrefix} Shoes ${id}`;
      const csv = [
        HEADER,
        `Runner,${shoes},${brand},50,40,Blue,80,3`,
        `Runner,${shoes},${brand},abc,41,Blue,80,3`,
        `,${shoes},${brand},50,42,Blue,80,3`,
        `Runner,${shoes},${brand},50,43,Blue,80,-2`,
        `Runner,${shoes},${brand},50,40,Blue,80,1`,
        `Runner,${categoryPrefix} Other ${id},${brand},50,44,Blue,80,1`,
        `Runner,${shoes},${brand},50,45,Blue,80,1`,
      ].join('\n');

      const summary = (await upload(csv).expect(200)).body as Summary;
      expect(summary).toMatchObject({ processed: 7, created: 2, skipped: 5, productsCreated: 1 });
      expect(summary.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);

      const byRow = Object.fromEntries(summary.errors.map((e) => [e.row, e.messages.join(' | ')]));
      expect(byRow[3]).toContain('costPrice');
      expect(byRow[4]).toContain('name should not be empty');
      expect(byRow[5]).toContain('stockQty must not be less than 0');
      expect(byRow[6]).toContain('already has a 40 / Blue variant');
      expect(byRow[7]).toBe(`Product "Runner" by ${brand} already exists in category "${shoes}"`);

      expect(await prisma.category.count({ where: { name: `${categoryPrefix} Other ${id}` } })).toBe(0);
      const variants = await prisma.productVariant.findMany({
        where: { product: { brand } },
        orderBy: { size: 'asc' },
      });
      expect(variants.map((v) => v.size)).toEqual(['40', '45']);
    });

    it('reports rows with missing cells instead of failing the file', async () => {
      const id = unique();
      const summary = (
        await upload(`${HEADER}\nShort,${categoryPrefix} Short ${id},${brandPrefix}-${id},5`).expect(200)
      ).body as Summary;
      expect(summary).toMatchObject({ processed: 1, created: 0, skipped: 1 });
      expect(summary.errors[0].row).toBe(2);
      expect(summary.errors[0].messages.join(' ')).toContain('size');
    });
  });
});
