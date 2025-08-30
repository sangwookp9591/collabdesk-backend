import { Module } from '@nestjs/common';
import { MessageRedisService } from './message-redis.service';
import { InviteRedisService } from './invite-redis.service';

@Module({
  providers: [MessageRedisService, InviteRedisService],
  exports: [MessageRedisService, InviteRedisService],
})
export class RedisModule {}
