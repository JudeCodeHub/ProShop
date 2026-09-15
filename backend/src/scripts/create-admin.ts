import { NestFactory } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../app.module.js';
import { AuthService } from '../auth/auth.service.js';
import { RegisterDto } from '../auth/dto/register.dto.js';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});

try {
  const prisma = app.get(PrismaService);
  if (await prisma.user.count({ where: { role: Role.admin } })) {
    throw new Error(
      'An admin already exists. Create further users with POST /api/auth/register.',
    );
  }

  const dto = plainToInstance(RegisterDto, {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: Role.admin,
  });
  const errors = await validate(dto);
  if (errors.length) {
    throw new Error(
      [
        'Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (min 8 characters):',
        ...errors.flatMap((e) => Object.values(e.constraints ?? {})),
      ].join('\n  '),
    );
  }

  const admin = await app.get(AuthService).register(dto);
  console.log(`Admin created: ${admin.email} (id ${admin.id})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}
