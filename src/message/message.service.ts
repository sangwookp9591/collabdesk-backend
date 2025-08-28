import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MessageService {
  constructor(private prisma: PrismaService) {}

  async getMessagesByChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }

    const userFields = {
      id: true,
      email: true,
      name: true,
      status: true,
      profileImageUrl: true,
    };

    const messages = await this.prisma.message.findMany({
      where: {
        channelId: channelId,
        parentId: null, //상위 메시지만
      },
      include: {
        user: {
          select: userFields,
        },
        replies: {
          // 스레드 포함
          include: { user: { select: userFields } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' }, // 최신순 혹은 오름차순
    });
    return messages;
  }
}
