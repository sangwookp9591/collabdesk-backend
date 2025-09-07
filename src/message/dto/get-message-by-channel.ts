import { IsOptional, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GetMessagesQueryDto {
  @IsOptional()
  cursor?: string;

  @IsOptional()
  @IsIn(['prev', 'next'])
  direction?: 'prev' | 'next' = 'prev';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 10;
}
