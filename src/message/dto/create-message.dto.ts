import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  channelId: string;

  @IsOptional()
  @IsString()
  parentId?: string; // 스레드 답글용
}
