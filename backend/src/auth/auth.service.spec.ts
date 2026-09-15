import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const prisma = { user: { create: vi.fn(), findUnique: vi.fn() } };
  const jwt = new JwtService({ secret: 'test-secret' });
  let service: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('register', () => {
    const dto = { name: 'Nimal', email: 'nimal@proshop.lk', password: 'secret-pass-1' };

    it('stores a bcrypt hash, defaults to cashier, and never selects the password', async () => {
      prisma.user.create.mockResolvedValue({ id: 1 });
      await service.register(dto);

      const { data, select } = prisma.user.create.mock.calls[0][0];
      expect(data.password).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, data.password)).toBe(true);
      expect(data.role).toBe('cashier');
      expect(select).not.toHaveProperty('password');
    });

    it('maps a duplicate email to ConflictException', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.0',
        }),
      );
      await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    const password = 'secret-pass-1';
    const user = async () => ({
      id: 7,
      name: 'Admin',
      email: 'admin@proshop.lk',
      role: 'admin',
      password: await bcrypt.hash(password, 4),
      createdAt: new Date(),
    });

    it('returns a token with userId and role', async () => {
      prisma.user.findUnique.mockResolvedValue(await user());
      const result = await service.login({ email: 'admin@proshop.lk', password });

      expect(await jwt.verifyAsync(result.accessToken)).toMatchObject({
        userId: 7,
        role: 'admin',
      });
      expect(result.user).toEqual({
        id: 7,
        name: 'Admin',
        email: 'admin@proshop.lk',
        role: 'admin',
      });
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(await user());
      await expect(
        service.login({ email: 'admin@proshop.lk', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@proshop.lk', password }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
