import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { UserModule } from 'src/user/user.module';
import { MessageController } from './message.controller';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { RedisModule } from 'src/redis/redis.module';
import { MailModule } from 'src/mail/mail.module';
import { ChannelModule } from 'src/channel/channel.module';
import { WorkspaceModule } from 'src/workspace/workspace.module';
@Module({
  imports: [
    PrismaModule,
    UserModule,
    JwtTokenModule,
    SupabaseModule,
    RedisModule,
    MailModule,
    ChannelModule,
    WorkspaceModule,
  ],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
