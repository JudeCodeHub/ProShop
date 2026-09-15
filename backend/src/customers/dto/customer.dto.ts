import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { normalizePhone } from '../phone.js';

export class CustomerDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const phone = normalizePhone(value);
    return phone === '' ? undefined : phone;
  })
  @IsString()
  @Matches(/^\+?\d{7,15}$/, { message: 'phone must be 7 to 15 digits, optionally starting with +' })
  phone?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const email = value.trim().toLowerCase();
    return email === '' ? undefined : email;
  })
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
