import { Module } from '@nestjs/common';
import { ExchangesController, ReturnsController } from './returns.controller.js';
import { ReturnsService } from './returns.service.js';

@Module({
  controllers: [ReturnsController, ExchangesController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
