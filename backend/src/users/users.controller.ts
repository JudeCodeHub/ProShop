import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { UsersService } from './users.service.js';

@Controller('users')
@Roles(Role.admin)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}
