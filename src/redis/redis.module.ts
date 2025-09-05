import { Global, Module } from '@nestjs/common';
import { MessageRedisService } from './message-redis.service';
import { InviteRedisService } from './invite-redis.service';
import { ConfigService } from '@nestjs/config';
import { RedisConnectionService } from './redis-connection.service';

@Global()
@Module({
  providers: [
    MessageRedisService,
    InviteRedisService,
    ConfigService,
    RedisConnectionService,
  ],
  exports: [MessageRedisService, InviteRedisService],
})
export class RedisModule {}
