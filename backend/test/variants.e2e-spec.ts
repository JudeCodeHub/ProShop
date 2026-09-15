import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { ean13CheckDigit } from './../src/variants/variant-codes.js';

const EMAIL_DOMAIN = '@variants-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface VariantBody {
  id: number;
  productId: number;
  size: string;
  color: string;
  sku: string;
  barcode: string;
  stockQty: number;
  sellPrice: string;
  product?: { id: number; name: string; category: { id: number } };
}

describe('Variants (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let cashierToken: string;
  let cashierId: number;
  let categoryId: number;

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const newProduct = async () =>
    prisma.product.create({
      data: { name: `Variant Shoe ${run}`, categoryId, brand: 'Nike', costPrice: 100 },
    });

  const addVariant = async (productId: number, body: object) =>
    (
      await api()
        .post(`/api/products/${productId}/variants`)
        .set(auth(adminToken))
        .send(body)
        .expect(201)
    ).body as VariantBody;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: { name: 'V Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    });
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'V Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));
    ({ id: categoryId } = await prisma.category.create({ data: { name: `E2E Variants ${run}` } }));

    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { cashierId } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('POST /api/products/:productId/variants', () => {
    it('creates a variant with a generated SKU and a valid EAN-13 barcode', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, { size: '42', color: 'Black', sellPrice: 150 });

      expect(variant).toMatchObject({ productId: product.id, size: '42', color: 'Black', stockQty: 0 });
      expect(variant.sku).toBe(`PROD-${product.id}-42-BLACK`);
      expect(variant.barcode).toMatch(/^200\d{10}$/);
      expect(Number(variant.barcode[12])).toBe(ean13CheckDigit(variant.barcode.slice(0, 12)));
      expect(Number(variant.sellPrice)).toBe(150);
    });

    it('normalizes the SKU and accepts starting stock', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, {
        size: ' 10.5 ',
        color: 'navy blue',
        sellPrice: 99.99,
        stockQty: 5,
      });
      expect(variant).toMatchObject({ size: '10.5', color: 'navy blue', stockQty: 5 });
      expect(variant.sku).toBe(`PROD-${product.id}-10-5-NAVY-BLUE`);
    });

    it('gives each variant a different barcode', async () => {
      const product = await newProduct();
      const a = await addVariant(product.id, { size: '40', color: 'Red', sellPrice: 1 });
      const b = await addVariant(product.id, { size: '41', color: 'Red', sellPrice: 1 });
      expect(a.barcode).not.toBe(b.barcode);
    });

    it('rejects a duplicate size and color with 409', async () => {
      const product = await newProduct();
      await addVariant(product.id, { size: 'M', color: 'White', sellPrice: 20 });
      const res = await api()
        .post(`/api/products/${product.id}/variants`)
        .set(auth(adminToken))
        .send({ size: 'M', color: 'White', sellPrice: 25 })
        .expect(409);
      expect(res.body.message).toContain('already has');
    });

    it.each([
      ['a negative price', { sellPrice: -1 }],
      ['negative stock', { stockQty: -1 }],
      ['decimal stock', { stockQty: 1.5 }],
      ['a size with no letters or digits', { size: '!!!' }],
      ['a client-supplied barcode', { barcode: '123' }],
      ['a missing color', { color: undefined }],
    ])('rejects %s', async (_label, overrides) => {
      const product = await newProduct();
      await api()
        .post(`/api/products/${product.id}/variants`)
        .set(auth(adminToken))
        .send({ size: 'L', color: 'Green', sellPrice: 10, ...overrides })
        .expect(400);
    });

    it('returns 404 for a missing product and 403 for a cashier', async () => {
      const body = { size: 'S', color: 'Pink', sellPrice: 10 };
      await api().post(`/api/products/${MISSING_ID}/variants`).set(auth(adminToken)).send(body).expect(404);
      const product = await newProduct();
      await api().post(`/api/products/${product.id}/variants`).set(auth(cashierToken)).send(body).expect(403);
    });
  });

  describe('GET /api/products/:productId/variants', () => {
    it('lists a product’s variants for a cashier', async () => {
      const product = await newProduct();
      await addVariant(product.id, { size: '9', color: 'Grey', sellPrice: 50 });
      await addVariant(product.id, { size: '8', color: 'Grey', sellPrice: 50 });

      const res = await api().get(`/api/products/${product.id}/variants`).set(auth(cashierToken)).expect(200);
      expect((res.body as VariantBody[]).map((v) => v.size)).toEqual(['8', '9']);
    });

    it('requires a token and returns 404 for a missing product', async () => {
      await api().get(`/api/products/${MISSING_ID}/variants`).expect(401);
      await api().get(`/api/products/${MISSING_ID}/variants`).set(auth(cashierToken)).expect(404);
    });
  });

  describe('GET /api/variants/barcode/:code', () => {
    it('finds the exact variant with its product and category for a cashier', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, { size: '43', color: 'Volt', sellPrice: 180 });

      const res = await api().get(`/api/variants/barcode/${variant.barcode}`).set(auth(cashierToken)).expect(200);
      const found = res.body as VariantBody;
      expect(found).toMatchObject({ id: variant.id, size: '43', color: 'Volt' });
      expect(found.product).toMatchObject({ id: product.id, category: { id: categoryId } });
    });

    it('returns 404 for an unknown barcode', () =>
      api().get('/api/variants/barcode/0000000000000').set(auth(cashierToken)).expect(404));
  });

  describe('PUT /api/variants/:id', () => {
    it('updates the variant, regenerates the SKU and keeps the barcode', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, { size: '44', color: 'Black', sellPrice: 150, stockQty: 3 });

      const res = await api()
        .put(`/api/variants/${variant.id}`)
        .set(auth(adminToken))
        .send({ size: '44', color: 'White', sellPrice: 160 })
        .expect(200);
      expect(res.body).toMatchObject({
        id: variant.id,
        color: 'White',
        sku: `PROD-${product.id}-44-WHITE`,
        barcode: variant.barcode,
        stockQty: 3,
      });
    });

    it('does not allow stock changes through PUT', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, { size: '45', color: 'Black', sellPrice: 150 });
      await api()
        .put(`/api/variants/${variant.id}`)
        .set(auth(adminToken))
        .send({ size: '45', color: 'Black', sellPrice: 150, stockQty: 100 })
        .expect(400);
    });

    it('returns 409 for a duplicate, 404 for a missing variant and 403 for a cashier', async () => {
      const product = await newProduct();
      await addVariant(product.id, { size: 'XL', color: 'Red', sellPrice: 30 });
      const other = await addVariant(product.id, { size: 'XL', color: 'Blue', sellPrice: 30 });
      const body = { size: 'XL', color: 'Red', sellPrice: 30 };

      await api().put(`/api/variants/${other.id}`).set(auth(adminToken)).send(body).expect(409);
      await api().put(`/api/variants/${MISSING_ID}`).set(auth(adminToken)).send(body).expect(404);
      await api().put(`/api/variants/${other.id}`).set(auth(cashierToken)).send(body).expect(403);
    });
  });

  describe('DELETE /api/variants/:id', () => {
    it('deletes a variant', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, { size: '46', color: 'Black', sellPrice: 150 });
      await api().delete(`/api/variants/${variant.id}`).set(auth(adminToken)).expect(204);
      await api().get(`/api/variants/barcode/${variant.barcode}`).set(auth(adminToken)).expect(404);
    });

    it('returns 404 for a missing variant and 403 for a cashier', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, { size: '47', color: 'Black', sellPrice: 150 });
      await api().delete(`/api/variants/${MISSING_ID}`).set(auth(adminToken)).expect(404);
      await api().delete(`/api/variants/${variant.id}`).set(auth(cashierToken)).expect(403);
    });

    it('refuses with 409 when the variant has been sold', async () => {
      const product = await newProduct();
      const variant = await addVariant(product.id, { size: '48', color: 'Black', sellPrice: 150 });
      await prisma.order.create({
        data: {
          cashierId,
          total: 150,
          paymentMethod: 'cash',
          items: { create: { variantId: variant.id, qty: 1, priceAtSale: 150 } },
        },
      });
      await api().delete(`/api/variants/${variant.id}`).set(auth(adminToken)).expect(409);
    });
  });
});
