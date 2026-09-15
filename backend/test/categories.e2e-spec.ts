import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@categories-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface CategoryBody {
  id: number;
  name: string;
  productCount?: number;
}

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  const prefix = `E2E Cat ${run}`;
  let adminToken: string;
  let cashierToken: string;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const uniqueName = () => `${prefix} ${++counter}`;

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const createCategory = async (name = uniqueName()) =>
    (
      await api().post('/api/categories').set(auth(adminToken)).send({ name }).expect(201)
    ).body as CategoryBody;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.createMany({
      data: [
        { name: 'C Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
        { name: 'C Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
      ],
    });
    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    const where = { name: { startsWith: prefix, mode: 'insensitive' as const } };
    await prisma.product.deleteMany({ where: { category: where } });
    await prisma.category.deleteMany({ where });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('GET /api/categories', () => {
    it('requires a token', () => api().get('/api/categories').expect(401));

    it('lists categories with their product count for a cashier', async () => {
      const category = await createCategory();
      await prisma.product.create({
        data: { name: 'Counted', categoryId: category.id, brand: 'Nike', costPrice: 1 },
      });

      const res = await api().get('/api/categories').set(auth(cashierToken)).expect(200);
      const listed = (res.body as CategoryBody[]).find((c) => c.id === category.id);
      expect(listed).toEqual({ id: category.id, name: category.name, productCount: 1 });
    });
  });

  describe('POST /api/categories', () => {
    it('creates a category with a trimmed name', async () => {
      const name = uniqueName();
      const res = await api()
        .post('/api/categories')
        .set(auth(adminToken))
        .send({ name: `  ${name}  ` })
        .expect(201);
      expect(res.body).toMatchObject({ name });
    });

    it('rejects a duplicate name, ignoring case', async () => {
      const category = await createCategory();
      await api().post('/api/categories').set(auth(adminToken)).send({ name: category.name }).expect(409);
      const res = await api()
        .post('/api/categories')
        .set(auth(adminToken))
        .send({ name: category.name.toUpperCase() })
        .expect(409);
      expect(res.body.message).toContain('already exists');
    });

    it.each([
      ['an empty name', { name: '   ' }],
      ['a missing name', {}],
      ['an unknown field', { name: 'Valid', slug: 'valid' }],
    ])('rejects %s', (_label, body) =>
      api().post('/api/categories').set(auth(adminToken)).send(body).expect(400));

    it('forbids a cashier', () =>
      api().post('/api/categories').set(auth(cashierToken)).send({ name: uniqueName() }).expect(403));
  });

  describe('PUT /api/categories/:id', () => {
    it('renames a category', async () => {
      const category = await createCategory();
      const name = uniqueName();
      const res = await api()
        .put(`/api/categories/${category.id}`)
        .set(auth(adminToken))
        .send({ name })
        .expect(200);
      expect(res.body).toEqual({ id: category.id, name });
    });

    it('allows changing only the letter case of its own name', async () => {
      const category = await createCategory();
      await api()
        .put(`/api/categories/${category.id}`)
        .set(auth(adminToken))
        .send({ name: category.name.toUpperCase() })
        .expect(200);
    });

    it('rejects a name used by another category, ignoring case', async () => {
      const taken = await createCategory();
      const category = await createCategory();
      await api()
        .put(`/api/categories/${category.id}`)
        .set(auth(adminToken))
        .send({ name: taken.name.toLowerCase() })
        .expect(409);
    });

    it('returns 404 for a missing category and 403 for a cashier', async () => {
      const category = await createCategory();
      await api().put(`/api/categories/${MISSING_ID}`).set(auth(adminToken)).send({ name: uniqueName() }).expect(404);
      await api().put(`/api/categories/${category.id}`).set(auth(cashierToken)).send({ name: uniqueName() }).expect(403);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('deletes an empty category', async () => {
      const category = await createCategory();
      await api().delete(`/api/categories/${category.id}`).set(auth(adminToken)).expect(204);
      expect(await prisma.category.findUnique({ where: { id: category.id } })).toBeNull();
    });

    it('refuses with a clear 409 while products still use it', async () => {
      const category = await createCategory();
      await prisma.product.createMany({
        data: [
          { name: 'Keeps A', categoryId: category.id, brand: 'Nike', costPrice: 1 },
          { name: 'Keeps B', categoryId: category.id, brand: 'Nike', costPrice: 1 },
        ],
      });

      const res = await api().delete(`/api/categories/${category.id}`).set(auth(adminToken)).expect(409);
      expect(res.body.message).toBe(
        `Category "${category.name}" still has 2 products. Move them to another category or delete them first.`,
      );
      expect(await prisma.category.findUnique({ where: { id: category.id } })).not.toBeNull();
    });

    it('moves all products to another category and deletes it with ?moveTo', async () => {
      const category = await createCategory();
      const target = await createCategory();
      await prisma.product.createMany({
        data: [
          { name: 'Moves A', categoryId: category.id, brand: 'Nike', costPrice: 1 },
          { name: 'Moves B', categoryId: category.id, brand: 'Nike', costPrice: 1 },
        ],
      });

      await api()
        .delete(`/api/categories/${category.id}?moveTo=${target.id}`)
        .set(auth(adminToken))
        .expect(204);

      expect(await prisma.category.findUnique({ where: { id: category.id } })).toBeNull();
      const moved = await prisma.product.findMany({
        where: { name: { in: ['Moves A', 'Moves B'] }, categoryId: target.id },
      });
      expect(moved).toHaveLength(2);
    });

    it('accepts ?moveTo for an empty category', async () => {
      const category = await createCategory();
      const target = await createCategory();
      await api()
        .delete(`/api/categories/${category.id}?moveTo=${target.id}`)
        .set(auth(adminToken))
        .expect(204);
    });

    it('rejects ?moveTo pointing at a missing category and changes nothing', async () => {
      const category = await createCategory();
      const product = await prisma.product.create({
        data: { name: 'Stays', categoryId: category.id, brand: 'Nike', costPrice: 1 },
      });

      const res = await api()
        .delete(`/api/categories/${category.id}?moveTo=${MISSING_ID}`)
        .set(auth(adminToken))
        .expect(400);
      expect(res.body.message).toContain('does not exist');

      expect(await prisma.category.findUnique({ where: { id: category.id } })).not.toBeNull();
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).categoryId,
      ).toBe(category.id);
    });

    it('rejects ?moveTo equal to the category being deleted, invalid values and unknown params', async () => {
      const category = await createCategory();
      await api().delete(`/api/categories/${category.id}?moveTo=${category.id}`).set(auth(adminToken)).expect(400);
      await api().delete(`/api/categories/${category.id}?moveTo=abc`).set(auth(adminToken)).expect(400);
      await api().delete(`/api/categories/${category.id}?moveTo=0`).set(auth(adminToken)).expect(400);
      await api().delete(`/api/categories/${category.id}?force=true`).set(auth(adminToken)).expect(400);
    });

    it('returns 404 when the category to delete is missing, even with ?moveTo', async () => {
      const target = await createCategory();
      await api()
        .delete(`/api/categories/${MISSING_ID}?moveTo=${target.id}`)
        .set(auth(adminToken))
        .expect(404);
    });

    it('returns 404 for a missing category and 403 for a cashier', async () => {
      const category = await createCategory();
      await api().delete(`/api/categories/${MISSING_ID}`).set(auth(adminToken)).expect(404);
      await api().delete(`/api/categories/${category.id}`).set(auth(cashierToken)).expect(403);
    });
  });
});
