import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetMessagesQueryDto } from './dto/get-message-by-channel';

@Injectable()
export class MessageService {
  constructor(private prisma: PrismaService) {}

  /**
   * 채널 메시지 조회 (무한스크롤용)
   * @param slug 채널 slug
   * @param cursor 마지막으로 가져온 메시지 id (마지막 메시지 기준)
   * @param take 한 번에 가져올 메시지 수
   */
  async getMessagesByChannel(slug: string, dto: GetMessagesQueryDto) {
    const take = dto?.take ?? 10;
    const page = dto?.page ?? 1;

    const skip = (page - 1) * take;
    const channel = await this.prisma.channel.findUnique({
      where: { slug: slug },
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

    const total = await this.prisma.message.count({
      where: {
        channelId: channel.id,
        parentId: null, //상위 메시지만
      },
    });
    const messages = await this.prisma.message.findMany({
      where: {
        channelId: channel.id,
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
      take,
      skip,
    });

    const hasMore = skip + messages.length < total;
    return { messages, hasMore, total };
  }

  async remove(id: string) {
    return this.prisma.message.delete({
      where: { id },
    });
  }
}
