import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { LowStockQueryDto } from './dto/low-stock-query.dto.js';
import { InventoryService } from './inventory.service.js';

@Controller()
@Roles(Role.admin)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('variants/:id/adjust-stock')
  adjustStock(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(id, user.userId, dto);
  }

  @Get('inventory/low-stock')
  findLowStock(@Query() query: LowStockQueryDto) {
    return this.inventoryService.findLowStock(query.threshold);
  }
}
