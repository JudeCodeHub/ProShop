import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CustomersService } from './customers.service.js';
import { CustomerDto } from './dto/customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { RedeemPointsDto } from './dto/redeem-points.dto.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(Role.cashier, Role.admin)
  findAll(@Query() query: ListCustomersQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.cashier, Role.admin)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.findOne(id);
  }

  @Post()
  @Roles(Role.cashier, Role.admin)
  create(@Body() dto: CustomerDto) {
    return this.customersService.create(dto);
  }

  @Put(':id')
  @Roles(Role.admin)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Post(':id/redeem-points')
  @Roles(Role.cashier, Role.admin)
  @HttpCode(HttpStatus.OK)
  redeemPoints(@Param('id', ParseIntPipe) id: number, @Body() dto: RedeemPointsDto) {
    return this.customersService.quoteRedemption(id, dto.points);
  }
}
