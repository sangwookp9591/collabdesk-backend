import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDmDto {
  @ApiProperty({ example: '상대방 ID', description: '사용자 이용자 ID' })
  @IsString()
  @IsNotEmpty()
  targetUserId: string;
}
