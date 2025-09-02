import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { RedisModule } from 'src/redis/redis.module';
import { MailModule } from 'src/mail/mail.module';
import { ChannelInviteService } from './channel-invite.service';

@Module({
  imports: [PrismaModule, JwtTokenModule, RedisModule, MailModule],
  controllers: [ChannelController],
  providers: [ChannelService, ChannelInviteService],
  exports: [ChannelService, ChannelInviteService],
})
export class ChannelModule {}
