import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnApplicationBootstrap, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from 'src/jwt-token/guards/ws-jwt-auth.guard';
import { MessageRedisService } from 'src/redis/message-redis.service';
import type {
  AuthenticatedSocket,
  JoinRoomPayload,
  TypingPayload,
} from './interfaces/socket.interface';
import { SocketService } from 'src/socket/socket.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/wsg',
})
@UseGuards(WsJwtAuthGuard)
export class SocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationBootstrap
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SocketGateway.name);
  private readonly subscribedChannels = new Set<string>();
  constructor(
    private readonly messageRedisService: MessageRedisService,
    private readonly socketService: SocketService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async onApplicationBootstrap() {
    // 모든 모듈 초기화 후 실행
    await this.setupRedisSubscriptions();
    this.logger.log('WebSocket Gateway initialized');
  }

  afterInit(server: Server) {
    this.socketService.setServer(server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const tokenParedClient = this.initTokenParse(client);
      await this.socketService.handleConnection(tokenParedClient);
    } catch (error) {
      client.emit('error', { message: `토큰 만료 ${error.message}` });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      const tokenParedClient = this.initTokenParse(client);

      await this.socketService.handleDisconnection(tokenParedClient);
    } catch (error) {
      client.emit('error', { message: `토큰 만료 ${error.message}` });
      client.disconnect(true);
    }
  }

  // ========== 룸 관리 이벤트 ==========

  @SubscribeMessage('joinWorkspace')
  async handleJoinWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { workspaceId: string },
  ) {
    await this.socketService.joinWorkspace(client, payload.workspaceId);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const { roomId, roomType } = payload;

    if (roomType === 'channel' || roomType === 'dm') {
      // Redis 채널 구독 (첫 사용자인 경우)
      const redisChannel = `${roomType}:${roomId}`;
      if (!this.subscribedChannels.has(redisChannel)) {
        await this.subscribeToRedisChannel(redisChannel);
      }

      await this.socketService.joinRoom(client, roomId, roomType);
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const { roomId, roomType } = payload;

    if (roomType === 'channel' || roomType === 'dm') {
      await this.socketService.leaveRoom(client, roomId, roomType);
    }
  }

  // ========== 타이핑 상태 이벤트 ==========

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload,
  ) {
    try {
      const userId = client.data.user.userId;

      await this.socketService.setUserTyping(
        payload.roomId,
        payload.roomType,
        userId,
        payload.isTyping,
        payload.userName,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle typing for user ${client.data.user.userId}:`,
        error,
      );
    }
  }

  // ========== 사용자 상태 이벤트 ==========

  @SubscribeMessage('updateStatus')
  async handleUpdateStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: { status: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB' },
  ) {
    try {
      const userId = client.data.user.userId;
      await this.socketService.updateUserStatus(userId, payload.status);
    } catch (error) {
      this.logger.error(
        `Failed to update status for user ${client.data.user.userId}:`,
        error,
      );
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      roomId: string;
      roomType: 'channel' | 'dm';
      lastReadMessageId?: string;
    },
  ) {
    try {
      const userId = client.data.user.userId;

      // Redis에서 읽지 않은 카운터 초기화
      await this.messageRedisService.resetUnreadCount(
        userId,
        payload.roomId,
        payload.roomType,
      );

      // 읽음 상태를 다른 기기들에게도 동기화
      await this.socketService.sendToUser(userId, 'readStatusSync', {
        roomId: payload.roomId,
        roomType: payload.roomType,
        lastReadMessageId: payload.lastReadMessageId,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to mark as read for user ${client.data.user.userId}:`,
        error,
      );
    }
  }

  // ========== Redis 구독 관리 ==========

  private async setupRedisSubscriptions() {
    try {
      // 글로벌 브로드캐스트 이벤트들 구독
      const subscriptions = [
        'global:notifications',
        'system:broadcasts',
        'server:heartbeat',
      ];

      for (const channel of subscriptions) {
        await this.messageRedisService.subscribeToChannel(
          channel,
          (message) => {
            this.handleRedisMessage(channel, message);
          },
        );
      }

      // 동적 채널 구독 (룸별 브로드캐스트)
      await this.messageRedisService.subscribeToChannel(
        'broadcast:*',
        (message) => {
          this.handleBroadcastMessage(message);
        },
      );

      this.logger.log('Redis subscriptions setup completed');
    } catch (error) {
      this.logger.error('Failed to setup Redis subscriptions:', error);
    }
  }

  private handleRedisMessage(channel: string, message: any) {
    try {
      switch (channel) {
        case 'global:notifications':
          this.server.emit('globalNotification', message);
          break;

        case 'system:broadcasts':
          this.server.emit('systemBroadcast', message);
          break;

        case 'server:heartbeat':
          this.handleServerHeartbeat(message);
          break;

        default:
          this.logger.debug(`Received Redis message from ${channel}:`, message);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle Redis message from ${channel}:`,
        error,
      );
    }
  }
  private async subscribeToRedisChannel(channel: string) {
    if (this.subscribedChannels.has(channel)) {
      return;
    }

    this.subscribedChannels.add(channel);

    await this.messageRedisService.subscribeToChannel(channel, (message) => {
      this.handleRedisMessage(channel, message);
    });

    this.logger.debug(`Subscribed to Redis channel: ${channel}`);
  }

  private handleBroadcastMessage(message: any) {
    try {
      const { event, data, excludeUserId, serverId } = message;

      // 같은 서버에서 발행한 메시지는 무시 (중복 방지)
      if (serverId === this.getServerId()) {
        return;
      }

      // 브로드캐스트 타입에 따라 처리
      if (message.roomId && message.roomType) {
        const roomKey = `${message.roomType}:${message.roomId}`;
        let broadcast = this.server.to(roomKey);

        // 특정 사용자 제외
        if (excludeUserId) {
          const excludeSocket =
            this.socketService.getSocketByUserId(excludeUserId);
          if (excludeSocket) {
            broadcast = broadcast.except(excludeSocket.id);
          }
        }

        broadcast.emit(event, data);
      } else if (message.userIds) {
        // 다중 사용자 전송
        for (const userId of message.userIds) {
          this.server.to(`user:${userId}`).emit(event, data);
        }
      }
    } catch (error) {
      this.logger.error('Failed to handle broadcast message:', error);
    }
  }

  // ========== 서버 관리 ==========
  // private setupServerHeartbeat() {
  //   const serverId = this.getServerId();

  //   setInterval(() => {
  //     (async () => {
  //       try {
  //         const stats = this.socketService.getServerStats();
  //         await this.messageRedisService.publishMessage('server:heartbeat', {
  //           serverId,
  //           stats,
  //           timestamp: Date.now(),
  //         });
  //       } catch (error) {
  //         this.logger.error('Failed to send server heartbeat:', error);
  //       }
  //     })();
  //   }, 5000);
  // }

  private handleServerHeartbeat(message: any) {
    if (message.serverId !== this.getServerId()) {
      // 다른 서버의 heartbeat 로그
      this.logger.debug(
        `Server ${message.serverId} heartbeat: ${JSON.stringify(message.stats)}`,
      );
    }
  }

  private initTokenParse(client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token) {
      throw new WsException('No token provided');
    }

    const payload = this.jwtService.verify(token, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
    });

    client.data.user = {
      userId: payload.sub,
      email: payload.email,
      iat: payload?.iat,
      exp: payload?.exp,
    };

    return client;
  }

  private getServerId(): string {
    return (
      this.configService.get<string>('SERVER_ID') || `server-${process.pid}`
    );
  }

  // ========== 외부 API 메서드들 ==========

  async notifyUser(userId: string, notification: any) {
    await this.socketService.sendToUser(userId, 'notification', notification);
  }

  async broadcastToWorkspace(workspaceId: string, event: string, data: any) {
    await this.socketService.broadcastToRoom(
      workspaceId,
      'workspace',
      event,
      data,
    );
  }

  async broadcastToChannel(channelId: string, event: string, data: any) {
    await this.socketService.broadcastToRoom(channelId, 'channel', event, data);
  }

  async notifyMention(userId: string, mentionData: any) {
    await this.socketService.sendToUser(userId, 'mention', mentionData);
  }

  // ========== 에러 핸들링 ==========

  handleError(client: AuthenticatedSocket, error: any) {
    this.logger.error(`Socket error for client ${client.id}:`, error);
    client.emit('error', {
      message: 'Internal server error',
      timestamp: Date.now(),
    });
  }

  handleDisconnectError(error: any) {
    this.logger.error('Socket disconnection error:', error);
  }
}
