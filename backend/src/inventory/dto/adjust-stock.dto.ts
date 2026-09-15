import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @NotEquals(0)
  @Min(-1000000)
  @Max(1000000)
  qtyChange: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;
}
