import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { UserModule } from 'src/user/user.module';
import { UserService } from 'src/user/user.service';
import { MessageController } from './message.controller';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, UserModule, JwtTokenModule],
  controllers: [MessageController],
  providers: [
    MessageGateway,
    MessageService,
    UserService,
    JwtAuthGuard,
    JwtService,
  ],
})
export class MessageModule {}
