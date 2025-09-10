// mention/mention.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MentionService {
  constructor(private readonly prisma: PrismaService) {}

  // 사용자의 멘션 목록 조회
  async getUserMentions(userId: string, page = 1, limit = 20) {
    const mentions = await this.prisma.mention.findMany({
      where: { userId },
      include: {
        message: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                profileImageUrl: true,
              },
            },
            channel: {
              select: { id: true, name: true, workspaceId: true },
            },
            dmConversation: {
              select: { id: true, user1Id: true, user2Id: true },
              include: {
                user1: { select: { id: true, name: true } },
                user2: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return mentions.map((mention) => ({
      id: mention.id,
      isRead: mention.isRead,
      readAt: mention.readAt,
      createdAt: mention.createdAt,
      message: {
        id: mention.message.id,
        content: mention.message.content,
        createdAt: mention.message.createdAt,
        user: mention.message.user,
        // 채널 메시지인지 DM 메시지인지 구분
        type: mention.message.channelId ? 'CHANNEL' : 'DM',
        channel: mention.message.channel,
        dmInfo: mention.message.dmConversation
          ? {
              conversationId: mention.message.dmConversation.id,
              otherUser:
                mention.message.dmConversation.user1Id === userId
                  ? mention.message.dmConversation.user2
                  : mention.message.dmConversation.user1,
            }
          : null,
      },
    }));
  }

  // 멘션을 읽음 처리
  async markMentionAsRead(mentionId: string, userId: string) {
    const mention = await this.prisma.mention.findUnique({
      where: { id: mentionId },
    });

    if (!mention || mention.userId !== userId) {
      throw new Error('Mention not found or access denied');
    }

    return this.prisma.mention.update({
      where: { id: mentionId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  // 모든 멘션을 읽음 처리
  async markAllMentionsAsRead(userId: string) {
    return this.prisma.mention.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  // 읽지 않은 멘션 수 조회
  async getUnreadMentionCount(userId: string) {
    return this.prisma.mention.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  // 메시지에서 멘션 파싱 및 생성
  async processMentions(messageId: string, content: string) {
    const mentions = this.parseMentions(content);

    if (mentions.length === 0) return;

    // @username 또는 @channel, @here 처리
    const userMentions = mentions.filter(
      (m) => !['channel', 'here'].includes(m),
    );

    if (userMentions.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          name: { in: userMentions },
        },
        select: { id: true },
      });

      const mentionData = users.map((user) => ({
        messageId,
        userId: user.id,
      }));

      await this.prisma.mention.createMany({
        data: mentionData,
        skipDuplicates: true,
      });
    }

    // @channel, @here 처리 (채널의 모든 사용자에게 알림)
    if (mentions.includes('channel') || mentions.includes('here')) {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: {
          channel: {
            include: {
              members: {
                select: { userId: true },
              },
            },
          },
        },
      });

      if (message?.channel) {
        const channelMemberIds = message.channel.members.map((m) => m.userId);
        const channelMentions = channelMemberIds.map((userId) => ({
          messageId,
          userId,
        }));

        await this.prisma.mention.createMany({
          data: channelMentions,
          skipDuplicates: true,
        });
      }
    }
  }

  private parseMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }
}
