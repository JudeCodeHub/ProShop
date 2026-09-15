import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@products-e2e.test';
const PASSWORD = 'correct-horse-9';

interface ProductBody {
  id: number;
  name: string;
  brand: string;
  costPrice: string;
  categoryId: number;
  category: { id: number; name: string };
  variants: { id: number; size: string }[];
}

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  const brand = `E2EBrand${run}`;
  let adminToken: string;
  let cashierToken: string;
  let categoryId: number;
  let otherCategoryId: number;
  let cashierId: number;

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const validProduct = (overrides: object = {}) => ({
    name: `Air Zoom ${run}`,
    categoryId,
    brand,
    costPrice: 120.5,
    ...overrides,
  });
  const createProduct = async (overrides: object = {}) =>
    (
      await api()
        .post('/api/products')
        .set(auth(adminToken))
        .send(validProduct(overrides))
        .expect(201)
    ).body as ProductBody;

  const login = async (email: string) =>
    (
      (
        await api()
          .post('/api/auth/login')
          .send({ email, password: PASSWORD })
          .expect(200)
      ).body as { accessToken: string }
    ).accessToken;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: { name: 'P Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    });
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'P Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));
    ({ id: categoryId } = await prisma.category.create({
      data: { name: `E2E Footwear ${run}` },
    }));
    ({ id: otherCategoryId } = await prisma.category.create({
      data: { name: `E2E Apparel ${run}` },
    }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    const categoryIds = [categoryId, otherCategoryId];
    await prisma.order.deleteMany({ where: { cashierId } });
    await prisma.product.deleteMany({ where: { categoryId: { in: categoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('access', () => {
    it('requires a token to list', () => api().get('/api/products').expect(401));

    it('lets a cashier read but not write', async () => {
      const product = await createProduct();
      await api().get('/api/products').set(auth(cashierToken)).expect(200);
      await api().get(`/api/products/${product.id}`).set(auth(cashierToken)).expect(200);
      await api().post('/api/products').set(auth(cashierToken)).send(validProduct()).expect(403);
      await api().put(`/api/products/${product.id}`).set(auth(cashierToken)).send(validProduct()).expect(403);
      await api().delete(`/api/products/${product.id}`).set(auth(cashierToken)).expect(403);
    });
  });

  describe('POST /api/products', () => {
    it('creates a product with its category and an empty variant list', async () => {
      const product = await createProduct({ name: '  Trimmed Name  ' });
      expect(product).toMatchObject({
        name: 'Trimmed Name',
        brand,
        categoryId,
        category: { id: categoryId },
        variants: [],
      });
      expect(Number(product.costPrice)).toBe(120.5);
    });

    it.each([
      ['a missing name', { name: undefined }],
      ['a negative cost price', { costPrice: -1 }],
      ['more than 2 decimals', { costPrice: 10.555 }],
      ['a string cost price', { costPrice: '10' }],
      ['an unknown field', { stockQty: 5 }],
    ])('rejects %s', (_label, overrides) =>
      api().post('/api/products').set(auth(adminToken)).send(validProduct(overrides)).expect(400));

    it('rejects a category that does not exist', async () => {
      const res = await api()
        .post('/api/products')
        .set(auth(adminToken))
        .send(validProduct({ categoryId: 2147483000 }))
        .expect(400);
      expect(res.body.message).toContain('does not exist');
    });
  });

  describe('GET /api/products', () => {
    it('filters by category and brand (case-insensitive) and includes variants', async () => {
      const shoe = await createProduct({ name: `Filter Shoe ${run}` });
      const shirt = await createProduct({ name: `Filter Shirt ${run}`, categoryId: otherCategoryId });
      await prisma.productVariant.create({
        data: { productId: shoe.id, size: '42', color: 'Black', sku: `SKU-${run}`, barcode: `BC-${run}`, sellPrice: 150 },
      });

      const byCategory = (
        await api().get(`/api/products?categoryId=${otherCategoryId}`).set(auth(cashierToken)).expect(200)
      ).body as ProductBody[];
      expect(byCategory.map((p) => p.id)).toEqual([shirt.id]);

      const byBrand = (
        await api()
          .get(`/api/products?brand=${brand.toUpperCase()}&categoryId=${categoryId}`)
          .set(auth(cashierToken))
          .expect(200)
      ).body as ProductBody[];
      const listedShoe = byBrand.find((p) => p.id === shoe.id);
      expect(listedShoe?.variants.map((v) => v.size)).toEqual(['42']);
      expect(byBrand.every((p) => p.categoryId === categoryId)).toBe(true);
    });

    it('rejects invalid and unknown query parameters', async () => {
      await api().get('/api/products?categoryId=abc').set(auth(adminToken)).expect(400);
      await api().get('/api/products?color=red').set(auth(adminToken)).expect(400);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns 404 for a missing product and 400 for a non-numeric id', async () => {
      await api().get('/api/products/2147483000').set(auth(adminToken)).expect(404);
      await api().get('/api/products/abc').set(auth(adminToken)).expect(400);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('replaces the product fields', async () => {
      const product = await createProduct();
      const res = await api()
        .put(`/api/products/${product.id}`)
        .set(auth(adminToken))
        .send(validProduct({ name: 'Renamed', categoryId: otherCategoryId, costPrice: 99.99 }))
        .expect(200);
      expect(res.body).toMatchObject({ id: product.id, name: 'Renamed', categoryId: otherCategoryId });
      expect(Number((res.body as ProductBody).costPrice)).toBe(99.99);
    });

    it('requires the full body', async () => {
      const product = await createProduct();
      await api().put(`/api/products/${product.id}`).set(auth(adminToken)).send({ name: 'Only name' }).expect(400);
    });

    it('returns 404 for a missing product and 400 for a missing category', async () => {
      const product = await createProduct();
      await api().put('/api/products/2147483000').set(auth(adminToken)).send(validProduct()).expect(404);
      await api()
        .put(`/api/products/${product.id}`)
        .set(auth(adminToken))
        .send(validProduct({ categoryId: 2147483000 }))
        .expect(400);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('deletes a product and its variants', async () => {
      const product = await createProduct();
      await prisma.productVariant.create({
        data: { productId: product.id, size: '40', color: 'Red', sku: `DEL-${run}`, barcode: `DELBC-${run}`, sellPrice: 10 },
      });
      await api().delete(`/api/products/${product.id}`).set(auth(adminToken)).expect(204);
      await api().get(`/api/products/${product.id}`).set(auth(adminToken)).expect(404);
      expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(0);
    });

    it('returns 404 for a missing product', () =>
      api().delete('/api/products/2147483000').set(auth(adminToken)).expect(404));

    it('refuses with 409 when a variant has been sold, and keeps the product', async () => {
      const product = await createProduct();
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, size: '44', color: 'Blue', sku: `SOLD-${run}`, barcode: `SOLDBC-${run}`, sellPrice: 150 },
      });
      await prisma.order.create({
        data: {
          cashierId,
          total: 150,
          paymentMethod: 'cash',
          items: { create: { variantId: variant.id, qty: 1, priceAtSale: 150 } },
        },
      });

      const res = await api().delete(`/api/products/${product.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toContain('cannot be deleted');
      await api().get(`/api/products/${product.id}`).set(auth(adminToken)).expect(200);
    });
  });
});
