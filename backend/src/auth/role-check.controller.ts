import { Controller, Get } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import { CurrentUser } from './current-user.decorator.js';
import type { JwtPayload } from './jwt.strategy.js';
import { Roles } from './roles.decorator.js';

@Controller('role-check')
export class RoleCheckController {
  @Get('admin')
  @Roles(Role.admin)
  admin(@CurrentUser() user: JwtPayload) {
    return { access: 'admin', user };
  }

  @Get('staff')
  @Roles(Role.cashier, Role.admin)
  staff(@CurrentUser() user: JwtPayload) {
    return { access: 'staff', user };
  }
}
