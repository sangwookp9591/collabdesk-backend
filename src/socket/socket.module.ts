import { Module } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { MessageModule } from 'src/message/message.module';
import { RedisModule } from 'src/redis/redis.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { SocketService } from './socket.service';
import { DmModule } from 'src/dm/dm.module';

@Module({
  imports: [MessageModule, RedisModule, JwtTokenModule, DmModule],
  providers: [SocketGateway, SocketService],
  exports: [SocketService],
})
export class SocketModule {}
