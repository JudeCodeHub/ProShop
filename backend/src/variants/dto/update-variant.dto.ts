import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const HAS_LETTER_OR_DIGIT = /[A-Za-z0-9]/;

export class UpdateVariantDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(HAS_LETTER_OR_DIGIT, { message: 'size must contain a letter or digit' })
  size: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(HAS_LETTER_OR_DIGIT, { message: 'color must contain a letter or digit' })
  color: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  sellPrice: number;
}
