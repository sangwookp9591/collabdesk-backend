import { ApiProperty } from '@nestjs/swagger';
import { ChannelRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';

export class InviteExistingMemberDto {
  @ApiProperty({ example: '워크스페이스 id', description: '워크스페이스 id' })
  @IsNotEmpty({ message: '워크스페이스 아이디는 필수값입니다.' })
  userId: string;

  @ApiProperty({ example: 'MEMBER', description: 'Channel Role MEMBER' })
  @IsNotEmpty({ message: '채널 역할값은  필수값입니다.' })
  role: ChannelRole;
}

export class InviteExistingMembersDto {
  @ApiProperty({ type: () => [InviteExistingMemberDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InviteExistingMemberDto)
  members: InviteExistingMemberDto[];

  @ApiProperty({ example: '채널 id', description: '채널 id' })
  @IsNotEmpty({ message: '채널 아이디는 필수값입니다.' })
  channelSlug: string;
}
