import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WorkspaceInviteService } from './workspace-invite.service';
import { RedisModule } from 'src/redis/redis.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    SupabaseModule,
    JwtTokenModule,
    RedisModule,
    MailModule,
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceInviteService],
  exports: [WorkspaceService, WorkspaceInviteService],
})
export class WorkspaceModule {}
