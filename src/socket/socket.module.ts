import { Module } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { RedisModule } from 'src/redis/redis.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { SocketService } from './socket.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [RedisModule, JwtTokenModule, PrismaModule],
  providers: [SocketGateway, SocketService],
  exports: [SocketService],
})
export class SocketModule {}
