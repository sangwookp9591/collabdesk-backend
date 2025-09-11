import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetMessagesQueryDto } from './dto/get-message-by-channel';
import { MentionType, MessageType } from '@prisma/client';
import { SocketService } from 'src/socket/socket.service';
import { NotificationWorker } from 'src/worker/notification/notification.worker';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketService: SocketService,
    private readonly notificationWorker: NotificationWorker,
  ) {}

  async createMessage(
    userId: string,
    dto: {
      slug?: string;
      channelSlug?: string;
      content: string;
      parentId?: string;
      dmConversationId?: string;
      mentions?: { type: MentionType; userId: string }[];
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

        this.logger.debug('dto.mentions  : ', dto.mentions);
        if (message && dto.mentions) {
          await Promise.all(
            dto.mentions.map((mention) => {
              return prisma.mention.create({
                data: {
                  type: mention?.type,
                  userId: mention?.type === 'USER' ? mention?.userId : null,
                  messageId: message.id,
                },
              });
            }),
          );
        }

        return message;
      });

      if (dto.mentions) {
        const roomId = channelId ? result?.channelId : result?.dmConversationId;
        const roomType = channelId ? 'channel' : 'dm';

        await this.processMention(
          workspaceId,
          result,
          roomId!,
          roomType,
          dto.mentions,
        );
      }

      await Promise.all([
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
   * @param dto 쿼리 파라미터
   */
  async getMessagesByChannel(slug: string, dto: GetMessagesQueryDto) {
    const take = dto?.take ?? 10;
    const cursor = dto.cursor;
    const direction = dto.direction || 'prev';

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

    // 커서 기준으로 메시지 조회
    const whereCondition: any = {
      channelId: channel.id,
      parentId: null, // 상위 메시지만
    };

    if (cursor) {
      if (direction === 'prev') {
        whereCondition.id = { lt: cursor };
      } else if (direction === 'next') {
        whereCondition.id = { gt: cursor };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: whereCondition,
      include: {
        user: {
          select: userFields,
        },
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
      orderBy: { createdAt: direction === 'prev' ? 'desc' : 'asc' },
      take,
    });

    const total = await this.prisma.message.count({
      where: {
        channelId: channel.id,
        parentId: null,
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
          channelId: channel.id,
          parentId: null,
          createdAt: { lt: earliestMessage.createdAt },
        },
        take: 1,
      });
      hasPrev = beforeCount > 0;

      // 더 이후 메시지가 있는지 확인
      const afterCount = await this.prisma.message.count({
        where: {
          channelId: channel.id,
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

  /**
   * 특정 메시지 주변의 메시지들을 조회 (멘션 점프용)
   * @param wsSlug 워크스페이스 slug
   * @param chSlug 채널 slug
   * @param messageId 중심이 될 메시지 ID
   * @param limit 총 가져올 메시지 수 (중심 메시지 포함)
   */
  async getMessagesAround(
    wsSlug: string,
    chSlug: string,
    messageId: string,
    take: number = 20,
  ) {
    const halfLimit = Math.floor((take - 1) / 2); // 중심 메시지 제외하고 절반씩

    // 워크스페이스와 채널 확인
    const channel = await this.prisma.channel.findFirst({
      where: {
        slug: chSlug,
        workspace: { slug: wsSlug },
      },
      include: {
        workspace: true,
      },
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

    // 1. 타겟 메시지 정보 가져오기
    const targetMessage = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        channelId: channel.id,
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
        channelId: channel.id,
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
        channelId: channel.id,
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
          channelId: channel.id,
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
          channelId: channel.id,
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
          channelId: channel.id,
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
          channelId: channel.id,
          parentId: null,
          createdAt: { gt: targetMessage.createdAt },
        },
        take: 1,
      });
      actualHasNext = afterCount > 0;
    }

    const total = await this.prisma.message.count({
      where: {
        channelId: channel.id,
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

  //process
  private async processMention(
    workspaceId: string,
    message: any,
    roomId: string,
    roomType: string,
    mentions?: { type: MentionType; userId: string }[],
  ) {
    let usersIds: string[] | undefined = [];
    const publishUserIds = await this.processMentionedUsers(
      roomId,
      roomType,
      mentions,
    );

    this.logger.debug(' processMention mentions : ', mentions);
    // 후속 처리들 (트랜잭션 외부에서 실행)
    const specialMention = mentions?.find(
      (item) => item.type === 'HERE' || item.type === 'EVERYONE',
    );
    if (specialMention) {
      usersIds = (await this.roomAllUsers(roomId, roomType)) ?? [];
    } else {
      usersIds = mentions?.map((mention) => mention.userId);
    }

    if (publishUserIds && publishUserIds?.length > 0) {
      await this.socketService.sendToWorkspaceUsersFiltered(
        workspaceId,
        publishUserIds,
        'workspaceNotice',
        {
          data: {
            type: 'MENTION',
            roomId: roomId,
            roomType: roomType,
            messageId: message?.id,
            data: message?.channelId
              ? `${message?.channel?.name}에서 이용자님을 언급했습니다.`
              : `${message?.user?.name}이 이용자님을 언급했습니다.`,
            message: {
              id: message?.id,
              content: message?.content,
              createdAt: message?.createdAt,
              messageType: 'USER',
            },
          },
        },
      );
    }
    this.logger.debug(' processMention usersIds : ', usersIds);
    if (usersIds && usersIds.length > 0) {
      await this.notificationWorker.addJob('notification', {
        workspaceId,
        userIds: usersIds,
        type: 'MENTION',
        roomId,
        roomType,
        messageId: message?.id,
        data: message.channelId
          ? `${message?.channel?.name}에서 이용자님을 언급했습니다.`
          : `${message?.user?.name}이 이용자님을 언급했습니다.`,
      });
    }
  }

  private async processMentionedUsers(
    roomId: string,
    roomType: string,
    mentions?: { type: MentionType; userId?: string }[],
  ): Promise<string[]> {
    if (!(mentions && mentions?.length > 0)) {
      return [];
    }
    const specialMention = mentions.find(
      (item) => item.type === 'HERE' || item.type === 'EVERYONE',
    );

    if (specialMention) {
      if (roomType === 'channel') {
        return await this.socketService.getChannelUsers(roomId);
      }
      return await this.socketService.getDMUsers(roomId);
    } else {
      return mentions.filter((item) => item.userId).map((item) => item.userId!);
    }
  }

  //validate
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

  //message
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

  private async roomAllUsers(roomId: string, roomType: string) {
    if (roomType && roomId) {
      if (roomType === 'channel') {
        const chMember = await this.prisma.channelMember.findMany({
          where: {
            channelId: roomId,
          },
          select: {
            userId: true,
          },
        });
        return chMember?.map((member) => member.userId);
      } else {
        const dmMember = await this.prisma.dMConversation.findUnique({
          where: {
            id: roomId,
          },
          select: {
            user1Id: true,
            user2Id: true,
          },
        });
        const { user1Id, user2Id } = dmMember!;
        return [user1Id, user2Id];
      }
    } else {
      return [];
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
