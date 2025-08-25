import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ example: '주식회사', description: '사용자 이름' })
  @IsNotEmpty({ message: '이름은 필수입니다.' })
  name: string;
}
