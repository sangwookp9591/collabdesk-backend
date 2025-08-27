import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [PrismaModule, UserModule, JwtTokenModule],
  providers: [MessageGateway, MessageService],
})
export class MessageModule {}
