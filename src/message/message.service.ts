import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetMessagesQueryDto } from './dto/get-message-by-channel';
import { MessageType } from '@prisma/client';

@Injectable()
export class MessageService {
  constructor(private prisma: PrismaService) {}

  async createUserMessage(
    userId: string,
    dto: { channelId: string; content: string; parentId?: string },
  ) {
    const userFields = {
      id: true,
      email: true,
      name: true,
      status: true,
      profileImageUrl: true,
    };
    return await this.prisma.message.create({
      data: {
        userId,
        channelId: dto.channelId,
        content: dto.content,
        parentId: dto.parentId,
      },
      include: {
        user: { select: userFields },
        replies: true,
        channel: {
          select: {
            slug: true,
          },
        },
      },
    });
  }

  async createMessageWithoutUser(dto: {
    channelId: string;
    content: string;
    messageType: MessageType;
  }) {
    return await this.prisma.message.create({
      data: {
        channelId: dto.channelId,
        content: dto.content,
        messageType: dto.messageType,
      },
      include: {
        channel: {
          select: {
            slug: true,
          },
        },
      },
    });
  }

  async getRecentMessages(userId: string, slug: string, take: number) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug: slug,
      },
    });
    if (!workspace) {
      throw new NotFoundException('워크스페이스가 존재하지 않습니다.');
    }
    return await this.prisma.message.findMany({
      where: {
        channel: {
          workspaceId: workspace.id,
          members: {
            some: {
              userId: userId,
            },
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileImageUrl: true,
            email: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take,
    });
  }

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

  async isWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });
    return !!member;
  }

  async getWorkspaceMember(workspaceId: string, userId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    return member;
  }

  async isChannelMember(channelId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId,
          channelId,
        },
      },
    });
    return !!member;
  }

  async getUserChannels(workspaceId: string, userId: string) {
    return await this.prisma.channel.findMany({
      where: {
        workspaceId,
        members: {
          some: {
            userId: userId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isPublic: true,
      },
    });
  }
}
