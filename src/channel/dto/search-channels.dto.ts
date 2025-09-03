import { IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetChannelsDto {
  @ApiPropertyOptional({ description: '페이지 번호', example: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: '페이지 크기', example: 20 })
  @IsOptional()
  @IsNumber()
  take?: number;

  @ApiPropertyOptional({ description: '정렬 기준', example: 'createdAt' })
  @IsOptional()
  @IsString()
  orderBy?: string;

  @ApiPropertyOptional({ description: '검색어', example: 'general' })
  @IsOptional()
  @IsString()
  search?: string;
}
