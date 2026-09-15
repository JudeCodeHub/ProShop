import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateExchangeDto {
  @IsInt()
  @Min(1)
  orderId: number;

  @IsInt()
  @Min(1)
  originalVariantId: number;

  @IsInt()
  @Min(1)
  newVariantId: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  qty: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(200)
  reason?: string;
}
