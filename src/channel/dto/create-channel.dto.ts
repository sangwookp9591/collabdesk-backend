import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  name: string;

  @IsString()
  workspaceId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
