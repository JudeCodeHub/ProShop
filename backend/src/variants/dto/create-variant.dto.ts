import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { UpdateVariantDto } from './update-variant.dto.js';

export class CreateVariantDto extends UpdateVariantDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  stockQty?: number;
}
