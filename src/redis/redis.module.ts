import { Module } from '@nestjs/common';
import { MessageRedisService } from './message-redis.service';

@Module({
  providers: [MessageRedisService],
  exports: [MessageRedisService],
})
export class RedisModule {}
