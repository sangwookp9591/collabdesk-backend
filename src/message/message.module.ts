import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { UserModule } from 'src/user/user.module';
import { MessageController } from './message.controller';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { MailModule } from 'src/mail/mail.module';
import { SocketModule } from 'src/socket/socket.module';
import { WorkspaceModule } from 'src/workspace/workspace.module';
import { NotificationWorker } from 'src/worker/notification/notification.worker';
@Module({
  imports: [
    PrismaModule,
    UserModule,
    JwtTokenModule,
    SupabaseModule,
    MailModule,
    SocketModule,
    WorkspaceModule,
  ],
  controllers: [MessageController],
  providers: [MessageService, NotificationWorker],
  exports: [MessageService],
})
export class MessageModule {}
