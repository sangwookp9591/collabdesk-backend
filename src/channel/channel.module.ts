import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { MailModule } from 'src/mail/mail.module';
import { ChannelInviteService } from './channel-invite.service';
import { SocketModule } from 'src/socket/socket.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    JwtTokenModule,
    MailModule,
    RedisModule,
    SocketModule,
  ],
  controllers: [ChannelController],
  providers: [ChannelService, ChannelInviteService],
  exports: [ChannelService, ChannelInviteService],
})
export class ChannelModule {}
