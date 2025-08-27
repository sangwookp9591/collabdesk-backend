import { IsString, IsNotEmpty } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  workspaceId: string;
}

export class JoinChannelDto {
  @IsString()
  @IsNotEmpty()
  channelId: string;
}
