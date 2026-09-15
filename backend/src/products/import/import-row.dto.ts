import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : Number(trimmed);
};

const HAS_LETTER_OR_DIGIT = /[A-Za-z0-9]/;
const PRICE = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 };

export class ImportRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand: string;

  @Transform(toNumber)
  @IsNumber(PRICE)
  @Min(0)
  @Max(99999999.99)
  costPrice: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(HAS_LETTER_OR_DIGIT, { message: 'size must contain a letter or digit' })
  size: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(HAS_LETTER_OR_DIGIT, { message: 'color must contain a letter or digit' })
  color: string;

  @Transform(toNumber)
  @IsNumber(PRICE)
  @Min(0)
  @Max(99999999.99)
  sellPrice: number;

  @Transform(toNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  stockQty?: number;
}
