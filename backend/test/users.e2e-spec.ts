import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@users-e2e.test';
const PASSWORD = 'correct-horse-9';
const MISSING_ID = 2147483000;

interface UserBody {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = Date.now();
  let adminToken: string;
  let adminId: number;
  let cashierId: number;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (path: string, body: object = {}, token = adminToken) =>
    api().post(path).set(bearer(token)).send(body);

  const login = (email: string, password = PASSWORD) =>
    api().post('/api/auth/login').send({ email, password });

  const tokenFor = async (email: string, password = PASSWORD) =>
    ((await login(email, password).expect(200)).body as { accessToken: string }).accessToken;

  const newStaff = async (role = Role.cashier) => {
    const email = `staff-${run}-${++counter}${EMAIL_DOMAIN}`;
    const created = (await post('/api/users', { name: `Staff ${counter}`, email, password: PASSWORD, role }).expect(201))
      .body as UserBody;
    return { ...created, email };
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const password = await bcrypt.hash(PASSWORD, 4);
    ({ id: adminId } = await prisma.user.create({
      data: { name: 'Users Admin', email: `admin-${run}${EMAIL_DOMAIN}`, password, role: Role.admin },
    }));
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'Users Cashier', email: `cashier-${run}${EMAIL_DOMAIN}`, password, role: Role.cashier },
    }));

    adminToken = await tokenFor(`admin-${run}${EMAIL_DOMAIN}`);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await app.close();
  });

  describe('listing and adding staff', () => {
    it('lists staff with their role and status, never the password', async () => {
      const res = await api().get('/api/users').set(bearer(adminToken)).expect(200);
      const ours = (res.body as UserBody[]).filter((user) => [adminId, cashierId].includes(user.id));
      expect(ours.map((user) => [user.name, user.role, user.isActive])).toEqual(
        expect.arrayContaining([
          ['Users Admin', 'admin', true],
          ['Users Cashier', 'cashier', true],
        ]),
      );
      expect(res.body[0]).not.toHaveProperty('password');
    });

    it('adds a staff member with a role, who can then sign in', async () => {
      const staff = await newStaff(Role.admin);
      expect(staff).toMatchObject({ role: 'admin', isActive: true });
      expect(staff).not.toHaveProperty('password');
      await login(staff.email).expect(200);
    });

    it.each([
      ['a duplicate email', { email: 'taken' }, 409],
      ['a short password', { password: 'short' }, 400],
      ['an invalid email', { email: 'not-an-email' }, 400],
      ['an unknown role', { role: 'owner' }, 400],
      ['a client-set status', { isActive: false }, 400],
    ])('rejects %s', async (_label, overrides, status) => {
      const existing = await newStaff();
      const body = {
        name: 'New Person',
        email: `new-${run}-${++counter}${EMAIL_DOMAIN}`,
        password: PASSWORD,
        role: Role.cashier,
        ...overrides,
        ...(overrides.email === 'taken' ? { email: existing.email } : {}),
      };
      await post('/api/users', body).expect(status);
    });

    it('is admin only', async () => {
      const cashierToken = await tokenFor(`cashier-${run}${EMAIL_DOMAIN}`);
      await api().get('/api/users').set(bearer(cashierToken)).expect(403);
      await post('/api/users', { name: 'x', email: `x-${run}${EMAIL_DOMAIN}`, password: PASSWORD }, cashierToken).expect(403);
      await api().get('/api/users').expect(401);
    });
  });

  describe('deactivating and reactivating', () => {
    it('blocks sign in and existing tokens, then lets them back in', async () => {
      const staff = await newStaff();
      const token = await tokenFor(staff.email);
      await api().get('/api/settings').set(bearer(token)).expect(200);

      const deactivated = await post(`/api/users/${staff.id}/deactivate`).expect(200);
      expect(deactivated.body).toMatchObject({ id: staff.id, isActive: false });

      const blocked = await login(staff.email).expect(401);
      expect(blocked.body.message).toBe('This account has been deactivated');
      await api().get('/api/settings').set(bearer(token)).expect(401);

      await post(`/api/users/${staff.id}/activate`).expect(200);
      await login(staff.email).expect(200);
      await api().get('/api/settings').set(bearer(token)).expect(200);
    });

    it('refuses to deactivate your own account', async () => {
      const res = await post(`/api/users/${adminId}/deactivate`).expect(400);
      expect(res.body.message).toBe('You cannot deactivate your own account');
    });

    it('returns 404 for a missing user and 400 for a bad id', async () => {
      await post(`/api/users/${MISSING_ID}/deactivate`).expect(404);
      await post('/api/users/abc/activate').expect(400);
    });
  });

  describe('editing and resetting passwords', () => {
    it('changes a name and role', async () => {
      const staff = await newStaff();
      const res = await api()
        .put(`/api/users/${staff.id}`)
        .set(bearer(adminToken))
        .send({ name: 'Promoted Person', role: Role.admin })
        .expect(200);
      expect(res.body).toMatchObject({ id: staff.id, name: 'Promoted Person', role: 'admin' });

      const token = await tokenFor(staff.email);
      await api().get('/api/users').set(bearer(token)).expect(200);
    });

    it('resets a password so the old one stops working', async () => {
      const staff = await newStaff();
      await post(`/api/users/${staff.id}/reset-password`, { password: 'brand-new-pass-1' }).expect(200);

      await login(staff.email).expect(401);
      await login(staff.email, 'brand-new-pass-1').expect(200);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
      expect(stored.password).not.toContain('brand-new-pass-1');
    });

    it('rejects a short password and a bad body', async () => {
      const staff = await newStaff();
      await post(`/api/users/${staff.id}/reset-password`, { password: 'short' }).expect(400);
      await api().put(`/api/users/${staff.id}`).set(bearer(adminToken)).send({ name: '', role: Role.cashier }).expect(400);
      await api().put(`/api/users/${staff.id}`).set(bearer(adminToken)).send({ name: 'x', role: 'owner' }).expect(400);
    });
  });
});
