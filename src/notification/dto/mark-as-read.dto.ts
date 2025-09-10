import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class MarkAsReadDto {
  @ApiProperty({ example: 'id', description: 'Notificaiton Id' })
  @IsNotEmpty({ message: '알림아이디가 존재하지 않습니다.' })
  id: string;
}
