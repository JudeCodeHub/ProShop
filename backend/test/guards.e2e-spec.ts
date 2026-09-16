import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Role } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const EMAIL_DOMAIN = '@guards-e2e.test';
const PASSWORD = 'correct-horse-9';
const ADMIN_ROUTE = '/api/users';
const STAFF_ROUTE = '/api/settings';
const MISSING_USER_ID = 2147483000;

describe('Global guards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = Date.now();
  const adminEmail = `admin-${run}${EMAIL_DOMAIN}`;
  const cashierEmail = `cashier-${run}${EMAIL_DOMAIN}`;
  let adminToken: string;
  let cashierToken: string;
  let adminId: number;
  let cashierId: number;

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    return req;
  };

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };

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
    ({ id: adminId } = await prisma.user.create({
      data: { name: 'Guard Admin', email: adminEmail, password, role: Role.admin },
    }));
    ({ id: cashierId } = await prisma.user.create({
      data: { name: 'Guard Cashier', email: cashierEmail, password, role: Role.cashier },
    }));

    adminToken = await login(adminEmail);
    cashierToken = await login(cashierEmail);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  describe('@Public routes', () => {
    it('serves /api/health without a token', () =>
      get('/api/health').expect(200));

    it('serves /api/auth/login without a token', () => login(adminEmail));
  });

  describe('JwtAuthGuard (global)', () => {
    it('blocks protected routes without a token', async () => {
      await get(STAFF_ROUTE).expect(401);
      await get(ADMIN_ROUTE).expect(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = await new JwtService({ secret: 'not-the-secret' }).signAsync({
        userId: adminId,
        role: 'admin',
      });
      await get(ADMIN_ROUTE, forged).expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = await jwt.signAsync(
        { userId: adminId, role: 'admin', iat: Math.floor(Date.now() / 1000) - 3600 },
        { expiresIn: '1s' },
      );
      await get(ADMIN_ROUTE, expired).expect(401);
    });

    it('rejects a token for a user who no longer exists', async () => {
      const ghost = await jwt.signAsync({ userId: MISSING_USER_ID, role: 'admin' });
      await get(ADMIN_ROUTE, ghost).expect(401);
    });
  });

  describe('@Roles("admin")', () => {
    it('forbids a cashier', () => get(ADMIN_ROUTE, cashierToken).expect(403));

    it('allows an admin', async () => {
      const res = await get(ADMIN_ROUTE, adminToken).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('@Roles("cashier", "admin")', () => {
    it('allows a cashier', async () => {
      const res = await get(STAFF_ROUTE, cashierToken).expect(200);
      expect(res.body).toHaveProperty('currency');
    });

    it('allows an admin', () => get(STAFF_ROUTE, adminToken).expect(200));

    it('takes the role from the database, not from the token', async () => {
      const stale = await jwt.signAsync({ userId: cashierId, role: 'admin' });
      await get(ADMIN_ROUTE, stale).expect(403);
    });
  });
});
