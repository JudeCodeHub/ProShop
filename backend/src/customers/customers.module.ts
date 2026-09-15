import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { LoyaltyService } from './loyalty.service.js';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, LoyaltyService],
  exports: [LoyaltyService],
})
export class CustomersModule {}
