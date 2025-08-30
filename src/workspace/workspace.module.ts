import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { WorkspaceInviteService } from './workspace-invite.service';
import { InviteRedisService } from 'src/redis/invite-redis.service';
import { MailService } from 'src/mail/mail.service';

@Module({
  imports: [PrismaModule, SupabaseModule, JwtTokenModule],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceService,
    JwtAuthGuard,
    JwtService,
    WorkspaceInviteService,
    InviteRedisService,
    MailService,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
