import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import {
  BestSellersQueryDto,
  DateRangeQueryDto,
  RevenueByCategoryQueryDto,
  SalesSummaryQueryDto,
} from './dto/report-queries.dto.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@Roles(Role.admin)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales-summary')
  salesSummary(@Query() query: SalesSummaryQueryDto) {
    return this.reportsService.salesSummary(query);
  }

  @Get('best-sellers')
  bestSellers(@Query() query: BestSellersQueryDto) {
    return this.reportsService.bestSellers(query);
  }

  @Get('revenue-by-category')
  revenueByCategory(@Query() query: RevenueByCategoryQueryDto) {
    return this.reportsService.revenueByCategory(query);
  }

  @Get('staff-performance')
  staffPerformance(@Query() query: DateRangeQueryDto) {
    return this.reportsService.staffPerformance(query);
  }

  @Get('stock-valuation')
  stockValuation() {
    return this.reportsService.stockValuation();
  }

  @Get('profit-margin')
  profitMargin(@Query() query: DateRangeQueryDto) {
    return this.reportsService.profitMargin(query);
  }
}
