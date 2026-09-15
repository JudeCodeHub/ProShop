import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class DeleteCategoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  moveTo?: number;
}
