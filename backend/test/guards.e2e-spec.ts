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
      await get('/api/role-check/staff').expect(401);
      await get('/api/role-check/admin').expect(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = await new JwtService({ secret: 'not-the-secret' }).signAsync({
        userId: adminId,
        role: 'admin',
      });
      await get('/api/role-check/admin', forged).expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = await jwt.signAsync(
        { userId: adminId, role: 'admin', iat: Math.floor(Date.now() / 1000) - 3600 },
        { expiresIn: '1s' },
      );
      await get('/api/role-check/admin', expired).expect(401);
    });
  });

  describe('@Roles("admin")', () => {
    it('forbids a cashier', () =>
      get('/api/role-check/admin', cashierToken).expect(403));

    it('allows an admin and exposes the token user', async () => {
      const res = await get('/api/role-check/admin', adminToken).expect(200);
      expect(res.body).toEqual({
        access: 'admin',
        user: { userId: adminId, role: 'admin' },
      });
    });
  });

  describe('@Roles("cashier", "admin")', () => {
    it('allows a cashier', async () => {
      const res = await get('/api/role-check/staff', cashierToken).expect(200);
      expect(res.body).toEqual({
        access: 'staff',
        user: { userId: cashierId, role: 'cashier' },
      });
    });

    it('allows an admin', () =>
      get('/api/role-check/staff', adminToken).expect(200));
  });
});
