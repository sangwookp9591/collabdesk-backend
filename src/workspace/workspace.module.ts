import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
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
  providers: [
    WorkspaceService,
    JwtAuthGuard,
    JwtService,
    WorkspaceInviteService,
  ],
})
export class WorkspaceModule {}
