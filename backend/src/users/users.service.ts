import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service.js';
import { RegisterDto } from '../auth/dto/register.dto.js';
import { Role } from '../generated/prisma/client.js';
import { isPrismaError, PrismaErrorCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResetPasswordDto, UpdateUserDto } from './dto/update-user.dto.js';

const BCRYPT_ROUNDS = 12;

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      select: userSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  create(dto: RegisterDto) {
    return this.auth.register(dto);
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.get(id);
    if (user.role === Role.admin && dto.role !== Role.admin) {
      await this.ensureAnotherActiveAdmin(id, 'change the role of');
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: { name: dto.name, role: dto.role },
        select: userSelect,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RecordNotFound)) {
        throw new NotFoundException(`User ${id} not found`);
      }
      throw error;
    }
  }

  async setActive(id: number, isActive: boolean, currentUserId: number) {
    const user = await this.get(id);
    if (!isActive) {
      if (id === currentUserId) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      if (user.role === Role.admin) {
        await this.ensureAnotherActiveAdmin(id, 'deactivate');
      }
    }
    if (user.isActive === isActive) {
      return user;
    }

    return this.prisma.user.update({ where: { id }, data: { isActive }, select: userSelect });
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    await this.get(id);
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.prisma.user.update({ where: { id }, data: { password }, select: userSelect });
  }

  private async get(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  private async ensureAnotherActiveAdmin(id: number, action: string) {
    const others = await this.prisma.user.count({
      where: { role: Role.admin, isActive: true, id: { not: id } },
    });
    if (others === 0) {
      throw new ConflictException(
        `You cannot ${action} the last active admin. Add another admin first.`,
      );
    }
  }
}
