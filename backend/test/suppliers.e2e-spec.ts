import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@suppliers-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface SupplierBody {
  id: number;
  name: string;
  contactInfo: string | null;
  purchaseOrderCount: number;
}

describe('Suppliers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  const prefix = `E2E Supplier ${run}`;
  let adminToken: string;
  let cashierToken: string;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const uniqueName = () => `${prefix} ${++counter}`;

  const login = async (email: string) =>
    (
      (await api().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200))
        .body as { accessToken: string }
    ).accessToken;

  const createSupplier = async (body: object = {}) =>
    (
      await api()
        .post('/api/suppliers')
        .set(bearer(adminToken))
        .send({ name: uniqueName(), ...body })
        .expect(201)
    ).body as SupplierBody;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.createMany({
      data: [
        { name: 'S Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
        { name: 'S Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
      ],
    });
    adminToken = await login(`admin-${run}${EMAIL_DOMAIN}`);
    cashierToken = await login(`cashier-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    const where = { supplier: { name: { startsWith: prefix } } };
    await prisma.purchaseOrder.deleteMany({ where });
    await prisma.supplier.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  it('is admin only', async () => {
    await api().get('/api/suppliers').expect(401);
    await api().get('/api/suppliers').set(bearer(cashierToken)).expect(403);
    await api().post('/api/suppliers').set(bearer(cashierToken)).send({ name: uniqueName() }).expect(403);
  });

  it('creates a supplier with trimmed fields and optional contact info', async () => {
    const name = uniqueName();
    const res = await api()
      .post('/api/suppliers')
      .set(bearer(adminToken))
      .send({ name: `  ${name}  `, contactInfo: '  Nimal, 0771234567  ' })
      .expect(201);
    expect(res.body).toMatchObject({ name, contactInfo: 'Nimal, 0771234567', purchaseOrderCount: 0 });

    const bare = await createSupplier();
    expect(bare.contactInfo).toBeNull();
  });

  it('lists suppliers with their purchase order count, and gets one', async () => {
    const supplier = await createSupplier();
    await prisma.purchaseOrder.create({ data: { supplierId: supplier.id } });

    const list = (await api().get('/api/suppliers').set(bearer(adminToken)).expect(200)).body as SupplierBody[];
    expect(list.find((s) => s.id === supplier.id)).toMatchObject({ purchaseOrderCount: 1 });

    const one = await api().get(`/api/suppliers/${supplier.id}`).set(bearer(adminToken)).expect(200);
    expect(one.body).toEqual({ ...supplier, purchaseOrderCount: 1 });

    await api().get(`/api/suppliers/${MISSING_ID}`).set(bearer(adminToken)).expect(404);
    await api().get('/api/suppliers/abc').set(bearer(adminToken)).expect(400);
  });

  it('replaces a supplier with PUT, clearing contact info when it is left out', async () => {
    const supplier = await createSupplier({ contactInfo: 'old@supplier.lk' });
    const name = uniqueName();
    const res = await api().put(`/api/suppliers/${supplier.id}`).set(bearer(adminToken)).send({ name }).expect(200);
    expect(res.body).toEqual({ id: supplier.id, name, contactInfo: null, purchaseOrderCount: 0 });

    await api().put(`/api/suppliers/${MISSING_ID}`).set(bearer(adminToken)).send({ name }).expect(404);
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['a missing name', { contactInfo: 'x' }],
    ['contact info over 500 characters', { name: 'Valid', contactInfo: 'x'.repeat(501) }],
    ['an unknown field', { name: 'Valid', email: 'a@b.lk' }],
  ])('rejects %s', (_label, body) =>
    api().post('/api/suppliers').set(bearer(adminToken)).send(body).expect(400));

  it('deletes a supplier without purchase orders', async () => {
    const supplier = await createSupplier();
    await api().delete(`/api/suppliers/${supplier.id}`).set(bearer(adminToken)).expect(204);
    await api().get(`/api/suppliers/${supplier.id}`).set(bearer(adminToken)).expect(404);
    await api().delete(`/api/suppliers/${MISSING_ID}`).set(bearer(adminToken)).expect(404);
  });

  it('refuses to delete a supplier that has purchase orders', async () => {
    const supplier = await createSupplier();
    await prisma.purchaseOrder.createMany({ data: [{ supplierId: supplier.id }, { supplierId: supplier.id }] });

    const res = await api().delete(`/api/suppliers/${supplier.id}`).set(bearer(adminToken)).expect(409);
    expect(res.body.message).toBe(`Supplier ${supplier.id} has 2 purchase orders and cannot be deleted`);
  });
});
