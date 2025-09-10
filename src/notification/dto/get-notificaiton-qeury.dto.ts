import { IsOptional, IsNumber, IsBoolean, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetNotificationQueryDto {
  @ApiPropertyOptional({ description: '페이지 크기', example: 20 })
  @IsOptional()
  @IsNumber()
  take?: number;

  @ApiPropertyOptional({ description: '읽음 여부', example: false })
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'workspaceId', example: 'workspaceId' })
  @IsString()
  @IsOptional()
  workspaceId?: string;
}
