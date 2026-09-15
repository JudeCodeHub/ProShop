import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CreateExchangeDto } from './dto/create-exchange.dto.js';
import { CreateReturnDto, PreviewReturnDto } from './dto/create-return.dto.js';
import { ListReturnsQueryDto } from './dto/list-returns-query.dto.js';
import { ReturnsService } from './returns.service.js';

@Controller('returns')
@Roles(Role.admin)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findAll(@Query() query: ListReturnsQueryDto) {
    return this.returnsService.findAll(query);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: PreviewReturnDto) {
    return this.returnsService.previewReturn(dto);
  }

  @Post()
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: JwtPayload) {
    return this.returnsService.createReturn(dto, user.userId);
  }
}

@Controller('exchanges')
@Roles(Role.admin)
export class ExchangesController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: CreateExchangeDto) {
    return this.returnsService.previewExchange(dto);
  }

  @Post()
  create(@Body() dto: CreateExchangeDto, @CurrentUser() user: JwtPayload) {
    return this.returnsService.createExchange(dto, user.userId);
  }
}
