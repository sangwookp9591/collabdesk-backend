import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { MessageService } from './message.service';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from 'src/jwt-token/guards/ws-jwt-auth.guard';
import { MessageRedisService } from './message-redis.service';

interface AuthenticatedSocket extends Socket {
  data: {
    user: {
      sub: string;
      email: string;
      iat: number;
      exp: number;
    };
  };
}

interface UserConnection {
  userId: string;
  socketId: string;
  currentWorkspace: string | null;
  joinedChannels: Set<string>;
  lastActiveAt: Date;
}
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/messages',
})
@UseGuards(WsJwtAuthGuard)
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessageGateway.name);

  constructor(
    private readonly messageService: MessageService,
    private readonly messageRedisService: MessageRedisService,
  ) {}

  afterInit() {}

  private subscribeToChannel(channelId: string) {
    const redisChannel = `channel:${channelId}`;
    this.messageRedisService.subscribeChannel(redisChannel, (message) => {
      this.server.to(redisChannel).emit('newMessage', message);
    });
  }
  async handleConnection(client: AuthenticatedSocket) {
    const auth = this.messageService.authenticateClient(client);
    if (!auth) {
      client.disconnect();
      return;
    }

    const userConnection: UserConnection = {
      userId: auth.userId,
      socketId: client.id,
      currentWorkspace: null,
      joinedChannels: new Set(),
      lastActiveAt: new Date(),
    };

    await this.messageRedisService.setUserConnection(
      auth.userId,
      userConnection,
    );
    client.emit('connected', {
      message: 'socket 연결 성공',
      userId: auth.userId,
      socketId: client.id,
    });
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const auth = this.messageService.authenticateClient(client);
    if (!auth) return;
    const connection = await this.messageRedisService.getUserConnection(
      auth.userId,
    );
    if (connection) {
      // 채널/워크스페이스에서 제거
      await this.messageRedisService.removeUserFromAllChannels(
        auth.userId,
        Array.from(connection.joinedChannels),
      );
      if (connection.currentWorkspace) {
        await this.messageRedisService.removeUserFromWorkspace(
          connection.currentWorkspace,
          auth.userId,
        );
      }
    }

    await this.messageRedisService.removeUserConnection(auth.userId);
  }

  @SubscribeMessage('joinWorkspace')
  async handleJoinWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { workspaceId: string },
  ) {
    const userId = client.data.user.sub;
    const isMember = await this.messageService.isWorkspaceMember(
      payload.workspaceId,
      userId,
    );

    if (!isMember) {
      client.emit('error', { message: 'Access denied to workspace' });
      return;
    }

    await this.messageRedisService.addUserToWorkspace(
      payload.workspaceId,
      userId,
    );
    const channels = await this.messageService.getUserChannels(
      payload.workspaceId,
      userId,
    );

    for (const channel of channels) {
      await this.messageRedisService.addUserToChannel(channel.id, userId);
      client.join(`channel:${channel.id}`);
      // 새로 접속한 서버가 아직 구독하지 않은 채널이면 구독
      this.subscribeToChannel(channel.id);
    }

    client.join(`workspace:${payload.workspaceId}`);
    client.to(`workspace:${payload.workspaceId}`).emit('userJoinedWorkspace', {
      userId,
      workspaceId: payload.workspaceId,
    });
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    dto: { channelId: string; content: string; parentId?: string },
  ) {
    const userId = client.data.user.sub;
    const newMessage = await this.messageService.create(userId, dto);
    await this.messageRedisService.publish(
      `channel:${dto.channelId}`,
      newMessage,
    );
  }
}
