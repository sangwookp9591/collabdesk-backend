import { Module } from '@nestjs/common';
import { InviteService } from './invite.service';
import { InviteController } from './invite.controller';
import { RedisModule } from 'src/redis/redis.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [RedisModule, PrismaModule, JwtTokenModule, MailModule],
  controllers: [InviteController],
  providers: [InviteService],
})
export class InviteModule {}
