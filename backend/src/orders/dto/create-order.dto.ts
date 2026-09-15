import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

export class OrderItemDto {
  @IsInt()
  @Min(1)
  variantId: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  qty: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  discount?: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
