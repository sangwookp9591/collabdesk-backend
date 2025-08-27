import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { MessageService } from './message.service';
import { Socket } from 'socket.io';
import { JwtTokenService } from '../jwt-token/jwt-token.service';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';

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

  handleDisconnect(client: AuthenticatedSocket) {
    client.disconnect();
  }
}
