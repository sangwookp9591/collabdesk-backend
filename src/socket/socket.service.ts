import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  AuthenticatedSocket,
  UserConnection,
} from './interfaces/socket.interface';
import { MessageRedisService } from 'src/redis/message-redis.service';
import { Channel } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);
  private server: Server;
  private readonly connectedUsers = new Map<string, AuthenticatedSocket>();

  constructor(
    private readonly messageRedisService: MessageRedisService,
    private readonly prisma: PrismaService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      const userId = socket.data?.user?.userId;
      this.connectedUsers.set(userId, socket);

      const userConnection: UserConnection = {
        userId,
        socketId: socket.id,
        workspaceId: null,
        joinedChannels: new Set(),
        joinedDMConversations: new Set(),
        lastActiveAt: new Date(),
        status: 'ONLINE',
      };

      await this.messageRedisService.setUserConnection(userId, userConnection);

      // 사용자별 개인 룸 참여 (알림, 멘션용)
      socket.join(`user:${userId}`);
      socket.rooms.add(`user:${userId}`);

      socket.emit('connected', {
        userId,
        socketId: socket.id,
        timestamp: Date.now(),
      });

      this.logger.log(`User connected: ${userId} (${socket.id})`);
    } catch (error) {
      this.logger.error(`Failed to handle connection for ${socket.id}:`, error);
      socket.emit('error', { message: 'Connection failed' });
    }
  }

  async handleDisconnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      const userId = socket.data?.user?.userId;
      this.connectedUsers.delete(userId);

      const connection =
        await this.messageRedisService.getUserConnection(userId);
      if (connection) {
        // 상태 변경을 다른 사용자들에게 알림
        await this.broadcastUserStatusChange(userId, 'OFFLINE');
        // 모든 룸에서 제거
        await this.leaveAllRooms(userId, connection);

        await this.handleUserDisconnectTyping(userId, connection);
      }

      await this.messageRedisService.removeUserConnection(userId);

      this.logger.log(`User disconnected: ${userId} (${socket.id})`);
    } catch (error) {
      this.logger.error(
        `Failed to handle disconnection for ${socket.id}:`,
        error,
      );
    }
  }

  async joinWorkspace(
    socket: AuthenticatedSocket,
    workspaceId: string,
  ): Promise<void> {
    try {
      const userId = socket.data.user.userId;

      // 워크스페이스 멤버십 확인
      const member = await this.prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        include: { workspace: { select: { name: true } } },
      });

      if (!member) {
        throw new Error('Not a member of this workspace');
      }

      // 워크스페이스 룸 참여
      const workspaceRoom = `workspace:${workspaceId}`;
      const roleRoom = `workspace:${workspaceId}:${member.role}`;

      socket.join(workspaceRoom);
      socket.join(roleRoom);
      socket.rooms?.add(workspaceRoom);
      socket.rooms?.add(roleRoom);

      // Redis 업데이트
      await this.messageRedisService.addUserToWorkspace(workspaceId, userId);

      const userChannels = await this.prisma.channel.findMany({
        where: {
          workspaceId: workspaceId,
          OR: [
            {
              members: {
                some: {
                  userId: userId,
                },
              },
            },
          ],
        },
        select: {
          id: true,
          slug: true,
        },
      });

      for (const channel of userChannels) {
        await this.joinRoom(socket, channel.id, 'channel');
      }

      const dmConversations = await this.prisma.dMConversation.findMany({
        where: {
          workspaceId: workspaceId,
          OR: [
            {
              user1Id: userId,
            },
            {
              user2Id: userId,
            },
          ],
        },
        select: {
          id: true,
        },
      });

      for (const dm of dmConversations) {
        await this.joinRoom(socket, dm.id, 'dm');
      }
      // 연결 정보 업데이트
      const connection =
        await this.messageRedisService.getUserConnection(userId);
      if (connection) {
        connection.workspaceId = workspaceId;
        await this.messageRedisService.setUserConnection(userId, connection);
      }

      //워크스페이스 이용자 정보 업데이트
      await this.messageRedisService.setWorkspaceUserStatus(
        userId,
        'ONLINE',
        workspaceId,
        '',
      );

      // 상태 변경을 다른 사용자들에게 알림
      await this.broadcastUserStatusChange(userId, 'ONLINE');

      //워크스페이스 맴버 상태정보 조회
      const userStatuses =
        await this.messageRedisService.getMultipleWorkspaceUserStatus(
          workspaceId,
        );

      this.logger.debug(`JoIn room userStatuses :`, userStatuses);
      socket.emit('workspaceJoined', {
        workspaceId: workspaceId,
        joinedChannels: userChannels.map((c) => c.id),
        joinedDMConversations: dmConversations.map((dm) => dm.id),
        userStatuses: userStatuses,
      });
      this.logger.debug(`User ${userId} joined workspace ${workspaceId}`);
    } catch (error) {
      this.logger.error(
        `Failed to join workspace ${workspaceId} for user ${socket?.data?.user.userId}:`,
        error,
      );
      socket.emit('error', { message: 'Failed to join workspace' });
    }
  }

  async leaveWorkspace(socket: AuthenticatedSocket) {
    const userId = socket.data?.user?.userId;
    this.connectedUsers.delete(userId);

    const connection = await this.messageRedisService.getUserConnection(userId);

    if (connection) {
      await this.leaveAllRooms(userId, connection);
    }
  }

  async joinRoom(
    socket: AuthenticatedSocket,
    roomId: string,
    roomType: 'channel' | 'dm',
  ): Promise<void> {
    try {
      const userId = socket.data?.user?.userId;
      const roomKey = `${roomType}:${roomId}`;

      socket.join(roomKey);
      socket.rooms.add(roomKey);

      // Redis에 사용자 추가
      if (roomType === 'channel') {
        await this.messageRedisService.addUserToChannel(roomId, userId);
      } else {
        await this.messageRedisService.addUserToDM(roomId, userId);
      }

      // 사용자 연결 정보 업데이트
      const connection =
        await this.messageRedisService.getUserConnection(userId);
      if (connection) {
        if (roomType === 'channel') {
          connection.joinedChannels.add(roomId);
        } else {
          connection.joinedDMConversations.add(roomId);
        }
        await this.messageRedisService.setUserConnection(userId, connection);
      }

      socket.emit('roomJoined', { roomId, roomType });

      this.logger.debug(`User ${userId} joined ${roomType} ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Failed to join ${roomType} ${roomId} for user ${socket.data.user.userId}:`,
        error,
      );
      socket.emit('error', { message: `Failed to join ${roomType}` });
    }
  }

  async leaveRoom(
    socket: AuthenticatedSocket,
    roomId: string,
    roomType: 'channel' | 'dm',
  ): Promise<void> {
    try {
      const userId = socket.data?.user?.userId;
      const roomKey = `${roomType}:${roomId}`;

      socket.leave(roomKey);
      socket.rooms.delete(roomKey);

      // Redis에서 사용자 제거
      if (roomType === 'channel') {
        await this.messageRedisService.removeUserFromChannel(roomId, userId);
      } else {
        await this.messageRedisService.removeUserFromDM(roomId, userId);
      }

      socket.emit('roomLeft', { roomId, roomType });

      this.logger.debug(`User ${userId} left ${roomType} ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Failed to leave ${roomType} ${roomId} for user ${socket?.data?.user.userId}:`,
        error,
      );
    }
  }

  async getChannelUsers(channelId: string) {
    return await this.messageRedisService.getChannelUsers(channelId);
  }

  async channelCreated(channel: Channel) {
    await this.messageRedisService.publishMessage(
      `workspace:${channel?.workspaceId}`,
      {
        type: 'channelCreated',
        channel: channel,
      },
    );

    return channel;
  }

  async channelDeleted(channel: Channel) {
    await this.messageRedisService.publishMessage(
      `workspace:${channel?.workspaceId}`,
      {
        type: 'channelDeleted',
        channel: channel,
      },
    );

    return channel;
  }

  async getDMUsers(dmId: string) {
    return await this.getDMUsers(dmId);
  }

  async sendToUser(userId: string, event: string, data: any): Promise<void> {
    try {
      const userRoom = `user:${userId}`;
      const payload = {
        ...data,
        timestamp: Date.now(),
        serverId: this.getServerId(),
      };

      this.server.to(userRoom).emit(event, payload);

      // Redis를 통해 다른 서버에도 전파
      await this.messageRedisService.publishMessage(
        `user:${userId}:notification`,
        {
          event,
          data: payload,
          serverId: this.getServerId(),
        },
      );

      this.logger.debug(`Sent ${event} to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send to user ${userId}:`, error);
      throw error;
    }
  }

  async broadcastToWorkspaceRole(
    workspaceId: string,
    role: 'OWNER' | 'ADMIN' | 'MEMBER',
    event: string,
    data: any,
  ): Promise<void> {
    try {
      const roleRoom = `workspace:${workspaceId}:${role}`;

      const payload = {
        ...data,
        timestamp: Date.now(),
        workspaceId,
        targetRole: role,
      };

      this.server.to(roleRoom).emit(event, payload);

      await this.messageRedisService.publishMessage(
        `broadcast:workspace:${workspaceId}:${role}`,
        {
          event,
          data: payload,
          serverId: this.getServerId(),
        },
      );

      this.logger.debug(
        `Broadcasted ${event} to workspace ${workspaceId} role ${role}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast to workspace role ${workspaceId}:${role}:`,
        error,
      );
      throw error;
    }
  }

  async sendToWorkspaceUsersFiltered(
    workspaceId: string,
    targetUserIds: string[],
    event: string,
    data: any,
  ) {
    // 1. 워크스페이스 참여 중인 유저 확인
    const workspaceUsers =
      await this.messageRedisService.getWorkspaceUsers(workspaceId);

    const validUserIds = targetUserIds.filter((id) =>
      workspaceUsers.includes(id),
    );

    if (validUserIds.length === 0) return;

    // 2. sendToMultipleUsers 재사용
    await this.sendToMultipleUsers(validUserIds, event, {
      ...data,
      workspaceId,
    });
  }

  async sendToMultipleUsers(
    userIds: string[],
    event: string,
    data: any,
  ): Promise<void> {
    try {
      const payload = {
        ...data,
        timestamp: Date.now(),
      };

      // 현재 서버의 연결된 사용자들에게 전송
      for (const userId of userIds) {
        const socket = this.connectedUsers.get(userId);
        if (socket) {
          socket.emit(event, payload);
        }
      }

      // Redis를 통해 다른 서버들에게도 전파
      await this.messageRedisService.publishMessage(
        'broadcast:multiple-users',
        {
          event,
          data: payload,
          userIds,
          serverId: this.getServerId(),
        },
      );

      this.logger.debug(`Sent ${event} to ${userIds.length} users`);
    } catch (error) {
      this.logger.error(`Failed to send to multiple users:`, error);
      throw error;
    }
  }

  // ========== 타이핑 상태 관리 ==========

  async handleStartTyping(
    userId: string,
    roomId: string,
    roomType: 'channel' | 'dm',
  ): Promise<void> {
    try {
      // 1. Redis에 타이핑 상태 저장 (TTL 10초)
      await this.messageRedisService.setTypingUser(userId, roomId, roomType);

      // 2. 사용자 정보 가져오기
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, profileImageUrl: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // 3. 같은 룸의 다른 사용자들에게 타이핑 시작 알림
      const typingData = {
        userId,
        roomId,
        roomType,
        timestamp: Date.now(),
      };

      // 현재 서버의 사용자들에게 전송 (발신자 제외)
      await this.messageToRoom(
        roomId,
        roomType,
        'userStartTyping',
        typingData,
        userId, // 발신자 제외
      );

      this.logger.debug(
        `User ${userId} started typing in ${roomType}:${roomId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle start typing: ${userId}:${roomType}:${roomId}`,
        error,
      );
      throw error;
    }
  }

  async handleStopTyping(
    userId: string,
    roomId: string,
    roomType: 'channel' | 'dm',
  ): Promise<void> {
    try {
      // 1. Redis에서 타이핑 상태 제거
      await this.messageRedisService.removeTypingUser(userId, roomId, roomType);

      // 2. 같은 룸의 다른 사용자들에게 타이핑 종료 알림
      const typingData = {
        userId,
        roomId,
        roomType,
        timestamp: Date.now(),
      };

      // 현재 서버의 사용자들에게 전송 (발신자 제외)
      await this.messageToRoom(
        roomId,
        roomType,
        'userStopTyping',
        typingData,
        userId, // 발신자 제외
      );

      this.logger.debug(
        `User ${userId} stopped typing in ${roomType}:${roomId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle stop typing: ${userId}:${roomType}:${roomId}`,
        error,
      );
      throw error;
    }
  }

  async getTypingUsers(
    roomId: string,
    roomType: 'channel' | 'dm',
  ): Promise<any[]> {
    try {
      const typingUserIds = await this.messageRedisService.getTypingUsers(
        roomId,
        roomType,
      );

      if (typingUserIds && typingUserIds.length === 0) {
        return [];
      }

      // 사용자 정보 가져오기
      const users = await this.prisma.user.findMany({
        where: { id: { in: typingUserIds } },
        select: { id: true, name: true, email: true, profileImageUrl: true },
      });

      return users.map((user) => ({
        userId: user.id,
        user,
        timestamp: Date.now(),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get typing users: ${roomType}:${roomId}`,
        error,
      );
      return [];
    }
  }

  private async handleUserDisconnectTyping(
    userId: string,
    connection: UserConnection,
  ): Promise<void> {
    try {
      const promises: Promise<any>[] = [];

      // 참여 중인 모든 채널에서 타이핑 상태 제거
      for (const channelId of connection.joinedChannels) {
        promises.push(
          this.messageRedisService.removeTypingUser(
            userId,
            channelId,
            'channel',
          ),
        );

        // 다른 사용자들에게 타이핑 중지 알림
        promises.push(
          this.messageToRoom(
            channelId,
            'channel',
            'userStopTyping',
            {
              userId,
              roomId: channelId,
              roomType: 'channel',
              timestamp: Date.now(),
              reason: 'disconnect',
            },
            userId,
          ),
        );
      }

      // 참여 중인 모든 DM에서 타이핑 상태 제거
      for (const dmId of connection.joinedDMConversations) {
        promises.push(
          this.messageRedisService.removeTypingUser(userId, dmId, 'dm'),
        );

        // 다른 사용자들에게 타이핑 중지 알림
        promises.push(
          this.messageToRoom(
            dmId,
            'dm',
            'userStopTyping',
            {
              userId,
              roomId: dmId,
              roomType: 'dm',
              timestamp: Date.now(),
              reason: 'disconnect',
            },
            userId,
          ),
        );
      }

      await Promise.all(promises);
      this.logger.debug(
        `Cleared typing status for disconnected user: ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle user disconnect typing: ${userId}`,
        error,
      );
    }
  }

  // ========== 사용자 상태 관리 ==========

  async updateUserStatus(
    userId: string,
    status: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB',
  ): Promise<void> {
    try {
      const connection =
        await this.messageRedisService.getUserConnection(userId);
      if (connection) {
        connection.status = status;
        connection.lastActiveAt = new Date();
        await this.messageRedisService.setUserConnection(userId, connection);

        //워크스페이스 상태 업데이트
        if (connection?.workspaceId) {
          await this.messageRedisService.setWorkspaceUserStatus(
            userId,
            status,
            connection?.workspaceId,
            '',
          );
        }
      }

      // 상태 변경을 다른 사용자들에게 알림
      await this.broadcastUserStatusChange(userId, status);

      this.logger.debug(`Updated user status: ${userId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update user status for ${userId}:`, error);
    }
  }

  private async broadcastUserStatusChange(
    userId: string,
    status: string,
  ): Promise<void> {
    // 사용자가 참여 중인 워크스페이스들에 상태 변경 알림
    const connection = await this.messageRedisService.getUserConnection(userId);
    if (connection && connection.workspaceId) {
      this.logger.debug(`Updated user status: ${userId} -> ${status}`);
      await this.broadcastToRoom(
        connection.workspaceId,
        'workspace',
        'userStatusChanged',
        {
          userId,
          status,
          lastActiveAt: connection.lastActiveAt.toISOString(),
        },
      );
    }
  }

  // 유틸리티

  getSocketByUserId(userId: string): AuthenticatedSocket | undefined {
    return this.connectedUsers.get(userId);
  }

  async cacheMessage(message: any) {
    try {
      await this.messageRedisService.cacheMessage({
        messageId: message.id,
        content: message.content,
        userId: message.userId,
        channelId: message.channelId,
        dmConversationId: message.dmConversationId,
        createdAt: message.createdAt.toISOString(),
        messageType: message.messageType as 'USER' | 'SYSTEM' | 'DM',
      });
    } catch (error) {
      this.logger.error(`Failed to cache message ${message.id}:`, error);
      // 캐싱 실패해도 메시지는 성공으로 처리
    }
  }

  async updateReadNotification(userId: string, messageId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        userId: userId,
        messageId: messageId,
        isRead: false,
      },
    });
    if (notification) {
      return await this.prisma.notification.update({
        where: {
          id: notification.id,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
        select: {
          id: true,
        },
      });
    } else {
      return null;
    }
  }

  async updateReadLastMessage(
    userId: string,
    roomId: string,
    roomType: 'channel' | 'dm',
    lastReadMessageId: string,
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: lastReadMessageId },
      select: { id: true, createdAt: true },
    });
    if (!message) return null;

    if (roomType === 'channel') {
      const member = await this.prisma.channelMember.findUnique({
        where: { userId_channelId: { userId, channelId: roomId } },
        select: { lastReadMessageId: true },
      });

      if (member?.lastReadMessageId) {
        const currentMessage = await this.prisma.message.findUnique({
          where: { id: member.lastReadMessageId },
          select: { createdAt: true },
        });

        //  현재 읽은 메시지가 더 최신이면 업데이트 안 함
        if (currentMessage && currentMessage.createdAt >= message.createdAt) {
          return member.lastReadMessageId;
        }
      }

      await this.prisma.channelMember.update({
        where: { userId_channelId: { userId, channelId: roomId } },
        data: { lastReadMessageId },
      });
    } else {
      const dMConversation = await this.prisma.dMConversation.findUnique({
        where: { id: roomId },
        select: {
          id: true,
          user1Id: true,
          user2Id: true,
          user1LastReadMessageId: true,
          user2LastReadMessageId: true,
        },
      });

      if (!dMConversation) return null;

      const isUser1 = dMConversation.user1Id === userId;
      const currentId = isUser1
        ? dMConversation.user1LastReadMessageId
        : dMConversation.user2LastReadMessageId;

      if (currentId) {
        const currentMessage = await this.prisma.message.findUnique({
          where: { id: currentId },
          select: { createdAt: true },
        });

        if (currentMessage && currentMessage.createdAt >= message.createdAt) {
          return currentId;
        }
      }

      await this.prisma.dMConversation.update({
        where: { id: dMConversation.id },
        data: isUser1
          ? { user1LastReadMessageId: lastReadMessageId }
          : { user2LastReadMessageId: lastReadMessageId },
      });
    }

    return lastReadMessageId;
  }

  async updateUnreadCounts(message: any, senderId: string) {
    try {
      const roomId = message.channelId || message.dmConversationId;
      const roomType = message.channelId ? 'channel' : 'dm';

      if (roomType === 'channel') {
        // 채널 멤버들의 읽지 않은 카운터 증가 (발신자 제외)
        const channelMembers = await this.prisma.channelMember.findMany({
          where: {
            channelId: message.channelId,
            userId: { not: senderId },
          },
          select: { userId: true },
        });

        for (const member of channelMembers) {
          await this.messageRedisService.incrementUnreadCount(
            member.userId,
            roomId,
            roomType,
          );
        }
      } else if (roomType === 'dm') {
        // DM 상대방의 읽지 않은 카운터 증가
        const conversation = message.dmConversation;
        const receiverId =
          conversation.user1Id === senderId
            ? conversation.user2Id
            : conversation.user1Id;

        await this.messageRedisService.incrementUnreadCount(
          receiverId,
          roomId,
          roomType,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to update unread counts for message ${message.id}:`,
        error,
      );
    }
  }

  private async leaveAllRooms(
    userId: string,
    connection: UserConnection,
  ): Promise<void> {
    const promises: Promise<any>[] = [];

    // 워크스페이스에서 제거
    if (connection.workspaceId) {
      promises.push(
        this.messageRedisService.removeWorkspaceStatus(
          connection.workspaceId,
          userId,
        ),
      );
      promises.push(
        this.messageRedisService.removeUserFromWorkspace(
          connection.workspaceId,
          userId,
        ),
      );
    }

    // 모든 채널에서 제거
    for (const channelId of connection.joinedChannels) {
      promises.push(
        this.messageRedisService.removeUserFromChannel(channelId, userId),
      );
    }

    // 모든 DM에서 제거
    for (const dmId of connection.joinedDMConversations) {
      promises.push(this.messageRedisService.removeUserFromDM(dmId, userId));
    }

    await Promise.all(promises);
  }

  async broadcastToRoom(
    roomId: string,
    roomType: 'channel' | 'dm' | 'workspace',
    event: string,
    data: any,
    excludeUserId?: string, // 특정 사용자 제외 (메시지 발신자 등)
  ): Promise<void> {
    try {
      const roomKey = this.getRoomKey(roomType, roomId);

      // 현재 서버의 Socket.IO 룸으로 전송
      let socketBroadcast = this.server.to(roomKey);

      // 특정 사용자 제외
      if (excludeUserId) {
        const excludeSocket = this.connectedUsers.get(excludeUserId);
        if (excludeSocket) {
          socketBroadcast = socketBroadcast.except(excludeSocket.id);
        }
      }

      const payload = {
        ...data,
        timestamp: Date.now(),
        roomId,
        roomType,
        serverId: this.getServerId(),
      };

      socketBroadcast.emit(event, payload);

      // Redis를 통해 다른 서버 인스턴스들에게도 전파
      await this.messageRedisService.publishMessage(
        `broadcast:${roomType}:${roomId}`,
        {
          event,
          data: payload,
          excludeUserId,
          serverId: this.getServerId(),
        },
      );

      this.logger.debug(
        `Broadcasted ${event} to ${roomKey} (excludeUser: ${excludeUserId || 'none'})`,
      );
    } catch (error) {
      this.logger.error(`Failed to broadcast to ${roomType} ${roomId}:`, error);
      throw error;
    }
  }

  async messageToRoom(
    roomId: string,
    roomType: 'channel' | 'dm' | 'workspace',
    event: string,
    data: any,
    excludeUserId?: string, // 특정 사용자 제외 (메시지 발신자 등)
  ): Promise<void> {
    try {
      const roomKey = this.getRoomKey(roomType, roomId);

      // 현재 서버의 Socket.IO 룸으로 전송
      let socketBroadcast = this.server.to(roomKey);

      // 특정 사용자 제외
      if (excludeUserId) {
        const excludeSocket = this.connectedUsers.get(excludeUserId);
        if (excludeSocket) {
          socketBroadcast = socketBroadcast.except(excludeSocket.id);
        }
      }

      const payload = {
        ...data,
        timestamp: Date.now(),
        roomId,
        roomType,
        serverId: this.getServerId(),
      };

      socketBroadcast.emit(event, payload);

      // Redis를 통해 다른 서버 인스턴스들에게도 전파
      await this.messageRedisService.publishMessage(`${roomType}:${roomId}`, {
        event,
        data: payload,
        excludeUserId,
        serverId: this.getServerId(),
      });

      this.logger.debug(
        `message ${event} to ${roomKey} (excludeUser: ${excludeUserId || 'none'})`,
      );
    } catch (error) {
      this.logger.error(`Failed to broadcast to ${roomType} ${roomId}:`, error);
      throw error;
    }
  }

  async sendToTargets(key: string, event: string, data: any): Promise<void> {
    try {
      // 현재 서버의 Socket.IO 룸으로 전송
      const socketBroadcast = this.server.to(key);

      const payload = {
        ...data,
        timestamp: Date.now(),
        serverId: this.getServerId(),
      };

      socketBroadcast.emit(event, payload);

      // Redis를 통해 다른 서버 인스턴스들에게도 전파
      await this.messageRedisService.publishMessage(key, {
        event,
        data: payload,
        serverId: this.getServerId(),
      });

      this.logger.debug(`sendToTargets ${event} to ${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to sendToTargets to ${key} envent ${event}:`,
        error,
      );
      throw error;
    }
  }

  // 헬퍼 메서드들
  private getRoomKey(roomType: string, roomId: string): string {
    return `${roomType}:${roomId}`;
  }

  private getServerId(): string {
    return process.env.SERVER_ID || 'default-server';
  }

  // 통계 및 모니터링
  async getRoomStats(roomId: string, roomType: 'channel' | 'dm') {
    try {
      const roomKey = this.getRoomKey(roomType, roomId);
      const sockets = await this.server.in(roomKey).fetchSockets();

      return {
        roomId,
        roomType,
        connectedUsers: sockets.length,
        userIds: sockets.map((s) => (s as any).user?.userId).filter(Boolean),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get room stats for ${roomType} ${roomId}:`,
        error,
      );
      return {
        roomId,
        roomType,
        connectedUsers: 0,
        userIds: [],
      };
    }
  }

  getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  getServerStats() {
    try {
      const allRooms = this.server.sockets.adapter.rooms;
      const totalConnections = this.server.sockets.sockets.size;

      return {
        serverId: this.getServerId(),
        totalConnections,
        connectedUsers: this.connectedUsers.size,
        totalRooms: allRooms.size,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get server stats:', error);
      return null;
    }
  }
}
