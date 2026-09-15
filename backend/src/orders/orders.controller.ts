import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.cashier, Role.admin)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.userId, dto);
  }

  @Post('hold')
  @Roles(Role.cashier, Role.admin)
  hold(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.hold(user.userId, dto);
  }

  @Get('held')
  @Roles(Role.cashier, Role.admin)
  findHeld(@CurrentUser() user: JwtPayload) {
    return this.ordersService.findHeld(user.userId);
  }

  @Post(':id/resume')
  @Roles(Role.cashier, Role.admin)
  @HttpCode(HttpStatus.OK)
  resume(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.ordersService.resume(id, user);
  }

  @Post(':id/void')
  @Roles(Role.admin)
  @HttpCode(HttpStatus.OK)
  voidOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.voidOrder(id);
  }
}
