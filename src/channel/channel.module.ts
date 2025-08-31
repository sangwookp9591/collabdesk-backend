import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelController } from './channel.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { RedisModule } from 'src/redis/redis.module';
import { MailModule } from 'src/mail/mail.module';
import { ChannelInviteService } from './channel-invite.service';

@Module({
  imports: [PrismaModule, JwtTokenModule, RedisModule, MailModule],
  controllers: [ChannelController],
  providers: [ChannelService, JwtAuthGuard, JwtService, ChannelInviteService],
})
export class ChannelModule {}
