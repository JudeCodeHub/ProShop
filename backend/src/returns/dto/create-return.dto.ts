import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ReturnItemDto {
  @IsInt()
  @Min(1)
  orderId: number;

  @IsInt()
  @Min(1)
  variantId: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  qty: number;
}

export class PreviewReturnDto extends ReturnItemDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CreateReturnDto extends ReturnItemDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;
}
