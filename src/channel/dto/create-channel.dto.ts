import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateChannelDto {
  @ApiProperty({ description: '채널이름', example: '채널 일므' })
  @IsString()
  name: string;

  @ApiProperty({ description: '워크스페이스 id', example: '워크스페이스 id' })
  @IsString()
  workspaceId: string;

  @ApiPropertyOptional({ description: '설명', example: '개발팀의 채널입니다.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '공개 여부', example: false })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
