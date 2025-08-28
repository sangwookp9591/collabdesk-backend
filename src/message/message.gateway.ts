import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { MessageService } from './message.service';
import { Socket } from 'socket.io';
import { JwtTokenService } from '../jwt-token/jwt-token.service';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { WorkspaceService } from 'src/workspace/workspace.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/messages',
})
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MessageGateway.name);
  private connectedUsers = new Map<
    string,
    { userId: string; workspaceId?: string }
  >();

  constructor(
    private readonly messageService: MessageService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly userService: UserService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        throw new UnauthorizedException('인증되지 않은 이용자 입니다.');
      }
      const payload = this.jwtTokenService.verifyAccessToken(token);

      const userId = payload?.sub;
      const email = payload?.email;
      client.data = { userId, email };
      this.connectedUsers.set(client.id, { userId });
      this.logger.log(`User ${email} (${userId}) connected`);

      await this.userService.updateStatus(userId, 'ONLINE');
    } catch (err) {
      this.logger.log(`Socket Connect Error : ${err}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userInfo = this.connectedUsers.get(client.id);

    if (userInfo) {
      try {
        // 사용자 상태를 OFFLINE으로 업데이트
        await this.userService.updateStatus(userInfo.userId, 'OFFLINE');

        // 워크스페이스에서 나가기
        if (userInfo.workspaceId) {
          client.leave(`workspace:${userInfo.workspaceId}`);

          // 워크스페이스 멤버들에게 사용자 오프라인 알림
          client.to(`workspace:${userInfo.workspaceId}`).emit('user-offline', {
            userId: userInfo.userId,
          });
        }

        this.connectedUsers.delete(client.id);
        this.logger.log(`User ${userInfo.userId} disconnected`);
      } catch (error) {
        this.logger.error('Error during disconnect:', error.message);
      }
    }
  }

  @SubscribeMessage('joinWorkspace')
  async handleJoinWorkspace(
    @ConnectedSocket() client: AuthenticatedSocket,

    @MessageBody() payload: { workspaceId: string },
  ) {
    const { userId } = client.data;
    const { workspaceId } = payload;

    const isMember = await this.workspaceService.isWorkspaceMember(
      workspaceId,
      userId,
    );
    if (!isMember) {
      client.emit('error', { message: 'Access denied to workspace' });
      return;
    }
  }
}
