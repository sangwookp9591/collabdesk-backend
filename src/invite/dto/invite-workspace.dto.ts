import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class InviteWorkspaceDto {
  @ApiProperty({ example: 'example@example.com', description: '이메일' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '주식회사', description: '사용자 이름' })
  @IsNotEmpty({ message: '워크스페이스 아이디는 필수값입니다.' })
  workspaceId: string;

  @ApiProperty({ example: 'MEMBER', description: 'Workspace Role MEMBER' })
  @IsNotEmpty({ message: '워크스페이스 역할값은  필수값입니다.' })
  workspaceRole: WorkspaceRole;
}
