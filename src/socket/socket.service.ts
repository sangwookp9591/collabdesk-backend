import { Injectable, Logger } from '@nestjs/common';
import { MessageRedisService } from 'src/redis/message-redis.service';
import { Channel, Message } from '@prisma/client';

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);

  constructor(private readonly messageRedisService: MessageRedisService) {}

  async publishChannelCreated(channel: Channel) {
    const ev = channel.isPublic
      ? 'channel:created:public'
      : 'channel:created:private';
    await this.messageRedisService.publish(ev, channel);
  }

  async publishMessage(channelId: string, message: Message) {
    await this.messageRedisService.publish(`channel:${channelId}`, message);
  }
}
