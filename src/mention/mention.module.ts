import { Module } from '@nestjs/common';
import { MentionService } from './mention.service';
import { MentionController } from './mention.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { WorkspaceModule } from 'src/workspace/workspace.module';

@Module({
  imports: [PrismaModule, JwtTokenModule, WorkspaceModule],
  controllers: [MentionController],
  providers: [MentionService],
})
export class MentionModule {}
