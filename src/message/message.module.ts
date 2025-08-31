import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { UserModule } from 'src/user/user.module';
import { UserService } from 'src/user/user.service';
import { MessageController } from './message.controller';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { WorkspaceService } from 'src/workspace/workspace.service';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { WsJwtAuthGuard } from 'src/jwt-token/guards/ws-jwt-auth.guard';
import { ChannelService } from 'src/channel/channel.service';
import { RedisModule } from 'src/redis/redis.module';
import { MessageRedisService } from 'src/redis/message-redis.service';
import { WorkspaceInviteService } from 'src/workspace/workspace-invite.service';
import { MailModule } from 'src/mail/mail.module';
import { ChannelModule } from 'src/channel/channel.module';
import { ChannelInviteService } from 'src/channel/channel-invite.service';
import { WorkspaceModule } from 'src/workspace/workspace.module';
@Module({
  imports: [
    PrismaModule,
    UserModule,
    JwtTokenModule,
    SupabaseModule,
    RedisModule,
    MailModule,
    ChannelModule,
    WorkspaceModule,
  ],
  controllers: [MessageController],
  providers: [
    MessageGateway,
    MessageService,
    UserService,
    WsJwtAuthGuard,
    JwtAuthGuard,
    JwtService,
    WorkspaceService,
    ChannelService,
    MessageRedisService,
    WorkspaceInviteService,
    ChannelInviteService,
  ],
})
export class MessageModule {}
