import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { ReceiptsController } from './receipts/receipts.controller.js';
import { ReceiptsService } from './receipts/receipts.service.js';

@Module({
  imports: [SettingsModule, CustomersModule],
  controllers: [OrdersController, ReceiptsController],
  providers: [OrdersService, ReceiptsService],
  exports: [OrdersService],
})
export class OrdersModule {}
