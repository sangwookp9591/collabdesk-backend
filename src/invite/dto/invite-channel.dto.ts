import { ApiProperty } from '@nestjs/swagger';
import { ChannelRole } from '@prisma/client';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class InviteChannelDto {
  @ApiProperty({ example: 'example@example.com', description: '이메일' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '워크스페이스 Slug',
    description: '워크스페이스 Slug',
  })
  @IsNotEmpty({ message: '워크스페이스 Slug 필수값입니다.' })
  workspaceSlug: string;

  @ApiProperty({ example: '채널 Slug', description: '채널 Slug' })
  @IsNotEmpty({ message: '채널 Slug 필수값입니다.' })
  channelSlug: string;

  @ApiProperty({ example: 'MEMBER', description: 'Channel Role MEMBER' })
  @IsNotEmpty({ message: '채널 역할값은  필수값입니다.' })
  channelRole: ChannelRole;
}
