import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetMessagesQueryDto } from './dto/get-message-by-channel';
import { MessageType } from '@prisma/client';
import { SocketService } from 'src/socket/socket.service';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketService: SocketService,
  ) {}

  async createMessage(
    userId: string,
    dto: {
      slug?: string;
      channelSlug?: string;
      content: string;
      parentId?: string;
      dmConversationId?: string;
    },
  ) {
    let channelId: any = null;
    let workspaceId: any = null;

    if (dto.channelSlug) {
      const channel = await this.prisma.channel.findUnique({
        where: {
          slug: dto.channelSlug,
        },
        select: {
          id: true,
          workspaceId: true,
        },
      });
      channelId = channel?.id;
      workspaceId = channel?.workspaceId;
      if (!channel) {
        throw new ForbiddenException('채널이 존재하지 않습니다. 아닙니다.');
      }
    } else {
      const conversation = await this.prisma.dMConversation.findUnique({
        where: {
          id: dto.dmConversationId,
        },
        select: {
          workspaceId: true,
        },
      });
      workspaceId = conversation?.workspaceId;
      if (!conversation) {
        throw new ForbiddenException(
          'DM 대화방이 존재하지 않습니다. 아닙니다.',
        );
      }
    }

    // 1. 권한 확인
    if (channelId) {
      await this.validateChannelAccess(channelId, userId);
    } else if (dto.dmConversationId) {
      await this.validateDMAccess(dto.dmConversationId, userId, workspaceId);
    } else {
      throw new ForbiddenException(
        'Either channelId or dmConversationId must be provided',
      );
    }

    // 2. 부모 메시지 검증 (스레드인 경우)
    if (dto.parentId) {
      await this.validateParentMessage(
        dto.parentId,
        channelId,
        dto.dmConversationId,
      );
    }

    try {
      // 3. 트랜잭션으로 메시지 생성
      const result = await this.prisma.$transaction(async (prisma) => {
        // 메시지 생성
        const message = await prisma.message.create({
          data: {
            content: dto.content,
            userId,
            channelId: channelId,
            dmConversationId: dto.dmConversationId,
            parentId: dto.parentId,
            messageType: dto.dmConversationId ? 'DM' : 'USER',
          },
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
            parent: {
              select: {
                id: true,
                content: true,
                createdAt: true,
                user: {
                  select: { id: true, name: true },
                },
              },
            },
            channel: channelId
              ? {
                  select: {
                    id: true,
                    name: true,
                    workspaceId: true,
                    isPublic: true,
                  },
                }
              : undefined,
            dmConversation: dto.dmConversationId
              ? {
                  select: {
                    id: true,
                    workspaceId: true,
                    user1Id: true,
                    user2Id: true,
                  },
                }
              : undefined,
          },
        });

        // DM인 경우 대화방 업데이트 시간 갱신
        if (dto.dmConversationId) {
          await prisma.dMConversation.update({
            where: { id: dto.dmConversationId },
            data: { updatedAt: new Date() },
          });
        }

        // 채널인 경우 마지막 활동 시간 업데이트
        if (channelId) {
          await prisma.channel.update({
            where: { id: channelId },
            data: { updatedAt: new Date() },
          });
        }

        return message;
      });

      // 4. 후속 처리들 (트랜잭션 외부에서 실행)
      await Promise.all([
        // 멘션 처리
        // this.processMentions(result, dto.content),

        // Redis 캐싱
        this.socketService.cacheMessage(result),

        // 읽지 않은 메시지 카운터 업데이트
        this.socketService.updateUnreadCounts(result, userId),

        // 실시간 알림 전송
        this.broadcastMessage(result, userId, workspaceId),
      ]);

      return result;
    } catch (error) {
      this.logger.error(`Failed to create message for user ${userId}:`, error);
      throw error;
    }
  }

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

  async editMessage(messageId: string, userId: string, content: string) {
    const userFields = {
      id: true,
      email: true,
      name: true,
      status: true,
      profileImageUrl: true,
    };

    return await this.prisma.message.update({
      where: { id: messageId, userId: userId },
      data: {
        content: content,
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
    });
  }

  async deleteMessage(messageId: string, userId: string) {
    return await this.prisma.message.delete({
      where: { id: messageId, userId: userId },
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
    const cursor = dto.cursor;
    const direction = dto.direction;

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
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });

    const total = await this.prisma.message.count({
      where: {
        channelId: channel.id,
        parentId: null, //상위 메시지만
      },
    });

    this.logger.debug('새로운 메세지 조회, ', messages);
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
  private async validateChannelAccess(channelId: string, userId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId },
      },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this channel');
    }
  }

  private async validateDMAccess(
    dmConversationId: string,
    userId: string,
    workspaceId: string,
  ) {
    const conversation = await this.prisma.dMConversation.findUnique({
      where: { id: dmConversationId },
    });

    this.logger.debug('validateDMAccess conversation : ', conversation);
    this.logger.debug('validateDMAccess workspaceId : ', workspaceId);

    if (!conversation) {
      throw new NotFoundException('DM conversation not found');
    }

    if (conversation.workspaceId !== workspaceId) {
      throw new ForbiddenException(
        'DM conversation does not belong to this workspace',
      );
    }

    if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
      throw new ForbiddenException(
        'You do not have access to this conversation',
      );
    }
  }

  private async validateParentMessage(
    parentId: string,
    channelId?: string,
    dmConversationId?: string,
  ) {
    const parentMessage = await this.prisma.message.findUnique({
      where: { id: parentId },
    });

    if (!parentMessage) {
      throw new NotFoundException('Parent message not found');
    }

    // 부모 메시지가 같은 채널/DM에 있는지 확인
    if (channelId && parentMessage.channelId !== channelId) {
      throw new ForbiddenException('Parent message is not in the same channel');
    }

    if (
      dmConversationId &&
      parentMessage.dmConversationId !== dmConversationId
    ) {
      throw new ForbiddenException(
        'Parent message is not in the same DM conversation',
      );
    }
  }

  private async broadcastMessage(
    message: any,
    senderId: string,
    workspaceId: string,
  ) {
    try {
      const roomId = message.channelId || message.dmConversationId;
      const roomType = message.channelId ? 'channel' : 'dm';

      // 메시지를 룸의 모든 사용자에게 전송 (발신자 제외)
      await this.socketService.messageToRoom(
        roomId,
        roomType,
        'newMessage',
        {
          message,
          isNew: true,
        },
        senderId, // 발신자 제외
      );

      // 워크스페이스 레벨 알림 (새 활동 표시용)
      if (message.channelId) {
        await this.socketService.broadcastToRoom(
          workspaceId,
          'workspace',
          'channelActivity',
          {
            channelId: message.channelId,
            channelName: message.channel.name,
            lastMessageAt: message.createdAt,
            messagePreview: message.content.substring(0, 100),
            sender: {
              id: message.user.id,
              name: message.user.name,
            },
          },
        );
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast message ${message.id}:`, error);
    }
  }
}
