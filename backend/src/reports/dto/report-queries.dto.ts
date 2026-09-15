import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Matches, Max, Min } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = '$property must be a date like 2026-09-15';

export class DateRangeQueryDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  to?: string;
}

export const SALES_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];

export class SalesSummaryQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(SALES_PERIODS)
  period?: SalesPeriod;
}

export class BestSellersQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export const REVENUE_GROUPS = ['category', 'brand'] as const;
export type RevenueGroup = (typeof REVENUE_GROUPS)[number];

export class RevenueByCategoryQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(REVENUE_GROUPS)
  by?: RevenueGroup;
}
