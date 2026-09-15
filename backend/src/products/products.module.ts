import { Module } from '@nestjs/common';
import { VariantsModule } from '../variants/variants.module.js';
import { ProductImportService } from './import/product-import.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [VariantsModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductImportService],
  exports: [ProductsService],
})
export class ProductsModule {}
