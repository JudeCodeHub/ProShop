import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const prisma = { user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() } };
  const auth = { register: vi.fn() };
  const service = new UsersService(prisma as unknown as PrismaService, auth as unknown as AuthService);
  const admin = { id: 1, name: 'Owner', email: 'owner@shop.lk', role: 'admin', isActive: true, createdAt: new Date() };
  const cashier = { ...admin, id: 2, name: 'Nimal', role: 'cashier' };

  beforeEach(() => vi.clearAllMocks());

  it('refuses to deactivate your own account', async () => {
    prisma.user.findUnique.mockResolvedValue(admin);
    await expect(service.setActive(1, false, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to deactivate or demote the last active admin', async () => {
    prisma.user.findUnique.mockResolvedValue(admin);
    prisma.user.count.mockResolvedValue(0);
    await expect(service.setActive(1, false, 99)).rejects.toThrow('the last active admin');
    await expect(service.update(1, { name: 'Owner', role: 'cashier' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows deactivating an admin when another active admin remains', async () => {
    prisma.user.findUnique.mockResolvedValue(admin);
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue({ ...admin, isActive: false });
    await expect(service.setActive(1, false, 99)).resolves.toMatchObject({ isActive: false });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });

  it('does nothing when the account is already in the wanted state', async () => {
    prisma.user.findUnique.mockResolvedValue(cashier);
    await expect(service.setActive(2, true, 1)).resolves.toMatchObject({ id: 2, isActive: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('never demotes a cashier check to an admin check', async () => {
    prisma.user.findUnique.mockResolvedValue(cashier);
    prisma.user.update.mockResolvedValue({ ...cashier, isActive: false });
    await service.setActive(2, false, 1);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('stores a hashed password when resetting, never the plain one', async () => {
    prisma.user.findUnique.mockResolvedValue(cashier);
    prisma.user.update.mockResolvedValue(cashier);
    await service.resetPassword(2, { password: 'new-pass-9876' });

    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data.password).not.toBe('new-pass-9876');
    expect(await bcrypt.compare('new-pass-9876', data.password)).toBe(true);
  });

  it('reports a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.setActive(404, false, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resetPassword(404, { password: 'whatever-1234' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
