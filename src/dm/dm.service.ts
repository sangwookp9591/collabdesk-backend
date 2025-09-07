import { Injectable, Logger } from '@nestjs/common';
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

    this.logger.debug('DM 메세지 조회 page take : ', take);
    const total = await this.prisma.message.count({
      where: {
        dmConversationId: conversationId,
        parentId: null, //상위 메시지만
      },
    });

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
      },
      orderBy: { createdAt: 'desc' },
      take,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });

    this.logger.debug('DM 메세지 조회 : ', messages);
    let prevCursor: string | null = null;
    let nextCursor: string | null = null;
    const hasMore = messages.length === take;
    if (hasMore && messages.length > 0) {
      if (direction === 'prev') {
        prevCursor = messages[messages.length - 1].id; // 더 오래된 메시지용
      } else {
        nextCursor = messages[0].id; // 더 최신 메시지용
      }
    }

    const orderedMessages = messages?.reverse();
    return {
      messages: orderedMessages,
      total,
      hasMore,
      prevCursor,
      nextCursor,
      direction,
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
    return await this.prisma.message.create({
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
  }

  private sortUserIds(user1Id: string, user2Id: string) {
    return [user1Id, user2Id].sort();
  }
}
