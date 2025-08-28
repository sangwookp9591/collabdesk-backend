import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const authHeader =
      client.handshake.headers['authorization'] || client.handshake.auth?.token; // socket.io client에서 보낸 auth 옵션도 가능

    if (!authHeader) {
      throw new UnauthorizedException('No token provided');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });

      if (!payload.sub) {
        throw new UnauthorizedException('Token payload missing user ID');
      }

      // client 객체에 user 정보 저장
      (client as any).user = payload;

      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token : ', err);
    }
  }
}
