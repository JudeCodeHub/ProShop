import { Module } from '@nestjs/common';
import { ProductVariantsController } from './product-variants.controller.js';
import { VariantsController } from './variants.controller.js';
import { VariantsService } from './variants.service.js';

@Module({
  controllers: [ProductVariantsController, VariantsController],
  providers: [VariantsService],
  exports: [VariantsService],
})
export class VariantsModule {}
