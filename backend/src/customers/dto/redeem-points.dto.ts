import { IsInt, Max, Min } from 'class-validator';

export class RedeemPointsDto {
  @IsInt()
  @Min(1)
  @Max(1000000)
  points: number;
}
