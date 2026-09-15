import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CreateVariantDto } from './dto/create-variant.dto.js';
import { VariantsService } from './variants.service.js';

@Controller('products/:productId/variants')
export class ProductVariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get()
  findAll(@Param('productId', ParseIntPipe) productId: number) {
    return this.variantsService.findByProduct(productId);
  }

  @Post()
  @Roles(Role.admin)
  create(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateVariantDto,
  ) {
    return this.variantsService.create(productId, dto);
  }
}
