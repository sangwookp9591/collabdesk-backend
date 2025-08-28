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
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessageGateway.name);

  // 사용자별 연결 정보 관리
  private userConnections = new Map<string, UserConnection>();

  // 워크스페이스별 온라인 사용자 관리
  private workspaceUsers = new Map<string, Set<string>>();

  // 채널별 온라인 사용자 관리
  private channelUsers = new Map<string, Set<string>>();

  constructor(private readonly messageService: MessageService) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      const auth = this.messageService.authenticateClient(client);
      if (!auth) {
        this.logger.log(`Socket Connect Error : NotFound User`);
        client.disconnect();
        return;
      }
      const { userId, email } = auth;
      this.userConnections.set(userId, {
        userId,
        socketId: client?.id,
        currentWorkspace: null,
        joinedChannels: new Set(),
        lastActiveAt: new Date(),
      });
      this.logger.log(`User ${email} (${userId}) connected`);

      // 연결 성공 정보 전송
      client.emit('connected', {
        message: 'socket 연결 성공',
        userId,
        socketId: client.id,
      });
    } catch (err) {
      this.logger.log(`Socket Connect Error : ${err}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    try {
      const auth = this.messageService.authenticateClient(client);

      if (auth?.userId) {
        const userId = auth?.userId;
        const useConnection = this.userConnections.get(userId);
        if (!useConnection) return;

        //워크스페이스 삭제
        const workspaceId = useConnection?.currentWorkspace;
        if (!workspaceId) return;

        const workspace = this.workspaceUsers.get(workspaceId);
        if (!workspace) return;
        workspace.delete(userId);

        useConnection.joinedChannels.forEach((channelId) => {
          const channel = this.channelUsers.get(channelId);
          channel?.delete(userId);
        });

        // 마지막 유저정보 삭제
        this.userConnections.delete(userId);
      }
    } catch (error) {
      this.logger.error('Disconnect error:', error.message);
    }
  }

  @SubscribeMessage('joinWorkspace')
  async handleJoinWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { workspaceId: string },
  ) {
    const userId = client.data.user.sub;
    const { workspaceId } = payload;
    const userInfo = this.userConnections.get(userId);
    if (!userInfo) {
      return;
    }
    const isMember = await this.messageService.isWorkspaceMember(
      workspaceId,
      userId,
    );
    console.log('isMember: ', isMember);
    if (!isMember) {
      client.emit('error', { message: 'Access denied to workspace' });
      return;
    }

    //다른 워크스페이스 방떠나기
    const prevWorkspaceId = userInfo.currentWorkspace;
    console.log('prevWorkspaceId : ', prevWorkspaceId);
    const connection = this.workspaceUsers;
    if (prevWorkspaceId) {
      const prevWorkspace = connection.get(prevWorkspaceId);
      client.leave(`workspace:${prevWorkspaceId}`);

      if (prevWorkspace?.has(userId)) {
        prevWorkspace?.delete(userId);
      }
    }
    // 참가하려는 워크스페이스가 없으면?
    if (!connection.has(workspaceId)) {
      connection.set(workspaceId, new Set());
    }
    connection.get(workspaceId)?.add(userId);

    //현재 워크스페이스 업데이트
    userInfo.currentWorkspace = workspaceId;
    client.join(`workspace:${workspaceId}`);

    this.logger.log(`User ${userId} joined workspace ${workspaceId}`);
    // 워크스페이스의 다른 멤버들에게 알림
    client.to(`workspace:${workspaceId}`).emit('userJoinedWorkspace', {
      userId,
      workspaceId,
    });

    //워크스페이스의 모든 채널에 참가
    const channels = await this.messageService.getUserChannels(
      workspaceId,
      userId,
    );
    channels.forEach((channel) => {
      if (!this.channelUsers.has(channel.id)) {
        this.channelUsers.set(channel?.id, new Set());
      }
      this.channelUsers.get(channel.id)?.add(userId);

      client.join(`channel:${channel.id}`);
    });
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    dto: { channelId: string; content: string; parentId?: string },
  ) {
    try {
      const userId = client.data.user.sub;

      const newMessage = await this.messageService.create(userId, dto);

      this.server.to(`channel:${dto.channelId}`).emit('newMessage', newMessage);
    } catch (err) {
      client.emit('error', err);
    }
  }
}
