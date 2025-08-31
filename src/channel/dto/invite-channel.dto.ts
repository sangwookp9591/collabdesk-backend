import { ApiProperty } from '@nestjs/swagger';
import { ChannelRole } from '@prisma/client';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class InviteChannelDto {
  @ApiProperty({ example: 'example@example.com', description: '이메일' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '워크스페이스 id', description: '워크스페이스 id' })
  @IsNotEmpty({ message: '워크스페이스 아이디는 필수값입니다.' })
  workspaceId: string;

  @ApiProperty({ example: '채널 id', description: '채널 id' })
  @IsNotEmpty({ message: '채널 아이디는 필수값입니다.' })
  channelId: string;

  @ApiProperty({ example: 'MEMBER', description: 'Channel Role MEMBER' })
  @IsNotEmpty({ message: '채널 역할값은  필수값입니다.' })
  channelRole: ChannelRole;
}
