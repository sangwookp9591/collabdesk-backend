import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetMessagesQueryDto } from './dto/get-message-by-dm';
import { SocketService } from '../socket/socket.service';

@Injectable()
export class DmService {
  private readonly logger = new Logger(DmService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketService: SocketService,
  ) {}

  async getUserDmConversations(userId: string, workspaceSlug: string) {
    const conversations = await this.prisma.dMConversation.findMany({
      where: {
        OR: [
          {
            user1Id: userId,
          },
          {
            user2Id: userId,
          },
        ],
        AND: [
          {
            workspace: {
              slug: workspaceSlug,
            },
          },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                profileImageUrl: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return conversations?.map((conversation) => {
      const otherUser =
        conversation.user1Id === userId
          ? conversation.user2
          : conversation.user1;
      const lastMessage = conversation.messages[0];

      return {
        id: conversation.id,
        otherUser,
        lastMessage,
        updatedAt: conversation.updatedAt,
      };
    });
  }

  async getUserDmConversationsRecent(userId: string, workspaceSlug: string) {
    const conversations = await this.prisma.dMConversation.findMany({
      where: {
        OR: [
          {
            user1Id: userId,
          },
          {
            user2Id: userId,
          },
        ],
        AND: [
          {
            workspace: {
              slug: workspaceSlug,
            },
          },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                profileImageUrl: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    return conversations?.map((conversation) => {
      const otherUser =
        conversation.user1Id === userId
          ? conversation.user2
          : conversation.user1;
      const lastMessage = conversation.messages[0];

      return {
        id: conversation.id,
        otherUser,
        lastMessage,
        updatedAt: conversation.updatedAt,
      };
    });
  }

  async createDmConversations(
    user1Id: string,
    user2Id: string,
    workspaceSlug: string,
  ) {
    const [userId1, userId2] = this.sortUserIds(user1Id, user2Id);
    const members = await this.prisma.workspaceMember.findMany({
      where: {
        workspace: {
          slug: workspaceSlug,
        },
        userId: {
          in: [userId1, userId2],
        },
      },
      select: {
        workspaceId: true,
        userId: true,
      },
    });

    const isBothMember =
      members.some((m) => m.userId === userId1) &&
      members.some((m) => m.userId === userId2);

    if (!isBothMember) {
      throw new Error('두 유저 모두 해당 워크스페이스 멤버가 아닙니다.');
    }

    const workspaceId = members[0]?.workspaceId;
    const dMConversation = await this.prisma.dMConversation.findUnique({
      where: {
        workspaceId_user1Id_user2Id: {
          workspaceId: workspaceId,
          user1Id: userId1,
          user2Id: userId2,
        },
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
      },
    });
    if (dMConversation) {
      return dMConversation;
    }
    const newConversation = await this.prisma.dMConversation.create({
      data: {
        user1Id: userId1,
        user2Id: userId2,
        workspaceId: workspaceId,
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
    this.logger.debug('CREATE NEW Conversation');
    await this.socketService.sendToUser(
      user2Id,
      'dmRoomCreated',
      newConversation,
    );

    return newConversation;
  }

  async getDmConversation(conversationId: string) {
    const conversation = await this.prisma.dMConversation.findUnique({
      where: {
        id: conversationId,
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            status: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                profileImageUrl: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return conversation;
  }

  async getDmMessages(conversationId: string, dto: GetMessagesQueryDto) {
    const take = dto?.take ?? 10;
    const cursor = dto?.cursor;
    const direction = dto.direction ?? 'prev';

    const userFields = {
      id: true,
      email: true,
      name: true,
      status: true,
      profileImageUrl: true,
    };

    const messages = await this.prisma.message.findMany({
      where: {
        dmConversationId: conversationId,
        parentId: null,
      },
      include: {
        user: {
          select: userFields,
        },
        replies: {
          // 스레드 포함
          include: { user: { select: userFields } },
          orderBy: { createdAt: 'desc' },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });

    this.logger.debug('DM 메세지 조회 page take : ', take);
    const total = await this.prisma.message.count({
      where: {
        dmConversationId: conversationId,
        parentId: null, //상위 메시지만
      },
    });

    // hasBefore, hasNext 확인을 위한 추가 쿼리
    let hasPrev = false;
    let hasNext = false;

    if (messages.length > 0) {
      const firstMessage = messages[0];
      const lastMessage = messages[messages.length - 1];

      // direction에 따라 정렬이 다르므로 실제 시간 기준으로 확인
      const earliestMessage = direction === 'prev' ? lastMessage : firstMessage;
      const latestMessage = direction === 'prev' ? firstMessage : lastMessage;

      // 더 이전 메시지가 있는지 확인
      const beforeCount = await this.prisma.message.count({
        where: {
          dmConversationId: conversationId,
          parentId: null,
          createdAt: { lt: earliestMessage.createdAt },
        },
        take: 1,
      });
      hasPrev = beforeCount > 0;

      // 더 이후 메시지가 있는지 확인
      const afterCount = await this.prisma.message.count({
        where: {
          dmConversationId: conversationId,
          parentId: null,
          createdAt: { gt: latestMessage.createdAt },
        },
        take: 1,
      });
      hasNext = afterCount > 0;
    }

    // 커서 설정
    let prevCursor: string | null = null;
    let nextCursor: string | null = null;

    if (messages.length > 0) {
      if (direction === 'prev') {
        const orderedMessages = messages.reverse(); // 시간순으로 정렬
        prevCursor = hasPrev ? orderedMessages[0].id : null; // 더 오래된 메시지용
        nextCursor = hasNext
          ? orderedMessages[orderedMessages.length - 1].id
          : null;
      } else {
        prevCursor = hasPrev ? messages[0].id : null;
        nextCursor = hasNext ? messages[messages.length - 1].id : null;
      }
    }

    const orderedMessages =
      direction === 'prev' ? messages.reverse() : messages;

    this.logger.debug('메시지 조회 완료', {
      count: messages.length,
      hasPrev,
      hasNext,
      direction,
    });

    return {
      messages: orderedMessages,
      total,
      hasMore: hasPrev || hasNext, // 전체적으로 더 있는지
      hasPrev,
      hasNext,
      prevCursor,
      nextCursor,
      direction,
    };
  }

  async getMessagesAroundMessage(
    conversationId: string,
    messageId: string,
    take: number = 20,
  ) {
    const halfLimit = Math.floor((take - 1) / 2); // 중심 메시지 제외하고 절반씩

    // 워크스페이스와 채널 확인
    const dMConversation = await this.prisma.dMConversation.findUnique({
      where: {
        id: conversationId,
      },
    });

    if (!dMConversation) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }

    const userFields = {
      id: true,
      email: true,
      name: true,
      status: true,
      profileImageUrl: true,
    };

    // 1. 타겟 메시지 정보 가져오기
    const targetMessage = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        dmConversationId: conversationId,
        parentId: null, // 상위 메시지만
      },
      include: {
        user: { select: userFields },
        replies: {
          include: { user: { select: userFields } },
          orderBy: { createdAt: 'desc' },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!targetMessage) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }

    // 2. 이전 메시지들 가져오기 (시간 기준)
    const beforeMessages = await this.prisma.message.findMany({
      where: {
        dmConversationId: conversationId,
        parentId: null,
        createdAt: { lt: targetMessage.createdAt },
      },
      include: {
        user: { select: userFields },
        replies: {
          include: { user: { select: userFields } },
          orderBy: { createdAt: 'desc' },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: halfLimit,
    });

    // 3. 이후 메시지들 가져오기 (시간 기준)
    const afterMessages = await this.prisma.message.findMany({
      where: {
        dmConversationId: conversationId,
        parentId: null,
        createdAt: { gt: targetMessage.createdAt },
      },
      include: {
        user: { select: userFields },
        replies: {
          include: { user: { select: userFields } },
          orderBy: { createdAt: 'desc' },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: halfLimit,
    });

    // 4. 결합 및 시간순 정렬
    const allMessages = [
      ...beforeMessages.reverse(), // 시간순으로 뒤집기
      targetMessage,
      ...afterMessages,
    ].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // 5. hasBefore, hasNext 확인
    const hasBefore = beforeMessages.length === halfLimit;
    const hasNext = afterMessages.length === halfLimit;

    // 실제로 더 이전/이후 메시지가 있는지 확인 (정확한 판단을 위해)
    let actualHasBefore = hasBefore;
    let actualHasNext = hasNext;

    if (beforeMessages.length > 0) {
      const beforeCount = await this.prisma.message.count({
        where: {
          dmConversationId: conversationId,
          parentId: null,
          createdAt: {
            lt: beforeMessages[beforeMessages.length - 1].createdAt,
          },
        },
        take: 1,
      });
      actualHasBefore = beforeCount > 0;
    } else {
      // 타겟 메시지보다 이전 메시지가 있는지 확인
      const beforeCount = await this.prisma.message.count({
        where: {
          dmConversationId: conversationId,
          parentId: null,
          createdAt: { lt: targetMessage.createdAt },
        },
        take: 1,
      });
      actualHasBefore = beforeCount > 0;
    }

    if (afterMessages.length > 0) {
      const afterCount = await this.prisma.message.count({
        where: {
          dmConversationId: conversationId,
          parentId: null,
          createdAt: { gt: afterMessages[afterMessages.length - 1].createdAt },
        },
        take: 1,
      });
      actualHasNext = afterCount > 0;
    } else {
      // 타겟 메시지보다 이후 메시지가 있는지 확인
      const afterCount = await this.prisma.message.count({
        where: {
          dmConversationId: conversationId,
          parentId: null,
          createdAt: { gt: targetMessage.createdAt },
        },
        take: 1,
      });
      actualHasNext = afterCount > 0;
    }

    const total = await this.prisma.message.count({
      where: {
        dmConversationId: conversationId,
        parentId: null,
      },
    });

    this.logger.debug('주변 메시지 조회 완료', {
      targetMessageId: messageId,
      totalMessages: allMessages.length,
      hasPrev: actualHasBefore,
      hasNext: actualHasNext,
    });

    return {
      messages: allMessages,
      targetMessage,
      total,
      hasMore: actualHasBefore || actualHasNext,
      hasPrev: actualHasBefore,
      hasNext: actualHasNext,
      prevCursor: actualHasBefore ? allMessages[0].id : null,
      nextCursor: actualHasNext ? allMessages[allMessages.length - 1].id : null,
      direction: 'around' as const,
    };
  }

  async createDMMessage(
    userId: string,
    dto: { dmConversationId: string; content: string; parentId?: string },
  ) {
    const userFields = {
      id: true,
      email: true,
      name: true,
      status: true,
      profileImageUrl: true,
    };

    // 멘션 파싱
    const mentions = this.parseMentions(dto?.content);

    const message = await this.prisma.message.create({
      data: {
        userId,
        messageType: 'DM',
        dmConversationId: dto.dmConversationId,
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

    // 멘션 저장
    if (mentions.length > 0) {
      await this.createMentions(message.id, mentions);
    }

    // DM 대화방 업데이트 시간 갱신
    await this.prisma.dMConversation.update({
      where: { id: dto.dmConversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  private sortUserIds(user1Id: string, user2Id: string) {
    return [user1Id, user2Id].sort();
  }

  // 멘션 파싱 (@username 형태)
  private parseMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }

  // 멘션 생성
  private async createMentions(messageId: string, mentions: string[]) {
    // username으로 사용자 찾기
    const users = await this.prisma.user.findMany({
      where: {
        name: {
          in: mentions,
        },
      },
      select: { id: true },
    });

    // 멘션 생성
    const mentionData = users.map((user) => ({
      messageId,
      userId: user.id,
    }));

    if (mentionData.length > 0) {
      await this.prisma.mention.createMany({
        data: mentionData,
        skipDuplicates: true,
      });
    }
  }

  // 읽지 않은 DM 메시지 수 조회
  async getUnreadDMCount(userId: string) {
    const conversations = await this.prisma.dMConversation.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        messages: {
          where: {
            userId: { not: userId }, // 본인이 보낸 메시지가 아닌 것
          },
        },
      },
    });

    return conversations.reduce(
      (total, conv) => total + conv.messages.length,
      0,
    );
  }
}
