import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { ReceiptsController } from './receipts/receipts.controller.js';
import { ReceiptsService } from './receipts/receipts.service.js';

@Module({
  controllers: [OrdersController, ReceiptsController],
  providers: [OrdersService, ReceiptsService],
  exports: [OrdersService],
})
export class OrdersModule {}
