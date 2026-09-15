import {
  Body,
  Controller,
  Delete,
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
import { CategoriesService } from './categories.service.js';
import { CategoryDto } from './dto/category.dto.js';
import { DeleteCategoryQueryDto } from './dto/delete-category-query.dto.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @Roles(Role.admin)
  create(@Body() dto: CategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Put(':id')
  @Roles(Role.admin)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DeleteCategoryQueryDto,
  ) {
    return this.categoriesService.remove(id, query.moveTo);
  }
}
