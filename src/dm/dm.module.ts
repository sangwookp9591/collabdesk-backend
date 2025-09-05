import { Module } from '@nestjs/common';
import { DmService } from './dm.service';
import { DmController } from './dm.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { WorkspaceModule } from 'src/workspace/workspace.module';
import { MessageModule } from 'src/message/message.module';
import { SocketModule } from 'src/socket/socket.module';

@Module({
  imports: [
    WorkspaceModule,
    PrismaModule,
    JwtTokenModule,
    MessageModule,
    SocketModule,
  ],
  controllers: [DmController],
  providers: [DmService],
})
export class DmModule {}
