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
import { SocketStateService } from 'src/socket-state/socket-state.service';

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
    private readonly socketState: SocketStateService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
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

    this.socketState.setUserConnection(auth.userId, userConnection);
    client.emit('connected', {
      message: 'socket 연결 성공',
      userId: auth.userId,
      socketId: client.id,
    });
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const auth = this.messageService.authenticateClient(client);
    if (!auth) return;

    this.socketState.removeUserConnection(auth.userId);
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

    this.socketState.joinWorkspace(userId, payload.workspaceId);
    client.join(`workspace:${payload.workspaceId}`);

    const channels = await this.messageService.getUserChannels(
      payload.workspaceId,
      userId,
    );
    channels.forEach((channel) => {
      this.socketState.joinChannel(userId, channel.id);
      client.join(`channel:${channel.id}`);
    });

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
    this.server.to(`channel:${dto.channelId}`).emit('newMessage', newMessage);
  }
}
