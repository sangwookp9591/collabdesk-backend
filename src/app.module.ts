// app.module.ts (깔끔해진 버전)
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { JwtTokenModule } from './jwt-token/jwt-token.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { UserModule } from './user/user.module';
import { ChannelModule } from './channel/channel.module';
import { MessageModule } from './message/message.module';
import { SocketStateModule } from './socket-state/socket-state.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { SocketModule } from './socket/socket.module';
import { InviteModule } from './invite/invite.module';
import { DmModule } from './dm/dm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    JwtTokenModule,
    WorkspaceModule,
    UserModule,
    ChannelModule,
    MessageModule,
    SocketStateModule,
    RedisModule,
    MailModule,
    SocketModule,
    InviteModule,
    DmModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
