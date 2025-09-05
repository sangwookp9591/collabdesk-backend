import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetMessagesQueryDto } from './dto/get-message-by-dm';

@Injectable()
export class DmService {
  constructor(private prisma: PrismaService) {}

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
    return await this.prisma.dMConversation.create({
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
      },
    });
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
    const page = dto?.page ?? 1;

    const skip = (page - 1) * take;

    const total = await this.prisma.message.count({
      where: {
        dmConversationId: conversationId,
        parentId: null, //상위 메시지만
      },
    });

    const messages = await this.prisma.message.findMany({
      where: {
        dmConversationId: conversationId,
        parentId: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            profileImageUrl: true,
          },
        },
        replies: {
          // 스레드 포함
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                profileImageUrl: true,
              },
            },
          },
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
