import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader) throw new UnauthorizedException('No token provided');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token)
      throw new UnauthorizedException('Invalid token');

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });

      if (!payload.sub) {
        throw new UnauthorizedException('Token payload missing user ID');
      }

      (request as any).user = payload; // payload를 Request.user에 저장
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token', err);
    }
  }
}
