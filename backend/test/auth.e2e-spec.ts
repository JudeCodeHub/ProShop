import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import type { JwtPayload } from './../src/auth/jwt.strategy.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@auth-e2e.test';
const PASSWORD = 'correct-horse-9';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = Date.now();
  const adminEmail = `admin-${run}${EMAIL_DOMAIN}`;
  const cashierEmail = `cashier-${run}${EMAIL_DOMAIN}`;

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });

  const register = (body: object, token?: string) => {
    const req = request(app.getHttpServer()).post('/api/auth/register');
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    return req.send(body);
  };

  const tokenFor = async (email: string): Promise<string> =>
    ((await login(email)).body as { accessToken: string }).accessToken;

  let counter = 0;
  const newUser = () => ({
    name: 'New Cashier',
    email: `new-${run}-${++counter}${EMAIL_DOMAIN}`,
    password: 'another-pass-1',
  });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const password = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.createMany({
      data: [
        { name: 'E2E Admin', email: adminEmail, password, role: Role.admin },
        { name: 'E2E Cashier', email: cashierEmail, password, role: Role.cashier },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('returns a JWT carrying userId and role, and the user without password', async () => {
      const res = await login(adminEmail).expect(200);
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: adminEmail },
      });

      const payload = await jwt.verifyAsync<JwtPayload>(res.body.accessToken);
      expect(payload).toMatchObject({ userId: admin.id, role: 'admin' });
      expect(res.body.user).toEqual({
        id: admin.id,
        name: 'E2E Admin',
        email: adminEmail,
        role: 'admin',
      });
    });

    it('treats the email case-insensitively', () =>
      login(adminEmail.toUpperCase()).expect(200));

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      const wrong = await login(adminEmail, 'wrong-password').expect(401);
      const unknown = await login(`nobody-${run}${EMAIL_DOMAIN}`).expect(401);
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('rejects an invalid body', () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400));
  });

  describe('POST /api/auth/register', () => {
    it('requires a token', () => register(newUser()).expect(401));

    it('rejects a forged token', () =>
      register(newUser(), 'not.a.jwt').expect(401));

    it('forbids cashiers', async () =>
      register(newUser(), await tokenFor(cashierEmail)).expect(403));

    it('lets an admin create a user with a hashed password', async () => {
      const user = newUser();
      const res = await register(user, await tokenFor(adminEmail)).expect(201);

      expect(res.body).toMatchObject({
        name: user.name,
        email: user.email,
        role: 'cashier',
      });
      expect(res.body).not.toHaveProperty('password');

      const stored = await prisma.user.findUniqueOrThrow({
        where: { email: user.email },
      });
      expect(stored.password).not.toBe(user.password);
      expect(await bcrypt.compare(user.password, stored.password)).toBe(true);

      await login(user.email, user.password).expect(200);
    });

    it('rejects a duplicate email', async () =>
      register(
        { ...newUser(), email: cashierEmail },
        await tokenFor(adminEmail),
      ).expect(409));

    it('rejects unknown fields, short passwords and invalid roles', async () => {
      const token = await tokenFor(adminEmail);
      await register({ ...newUser(), isAdmin: true }, token).expect(400);
      await register({ ...newUser(), password: 'short' }, token).expect(400);
      await register({ ...newUser(), role: 'owner' }, token).expect(400);
    });
  });
});
