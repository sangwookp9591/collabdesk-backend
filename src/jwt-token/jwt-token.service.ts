import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

export interface TokenPayload {
  sub: string;
  email: string;
  name?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtTokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: '15m', // 짧게 설정 (보안)
    });
  }

  async generateRefreshToken(userId: string): Promise<string> {
    const token = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );

    // DB에 리프레시 토큰 저장
    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30일
      },
    });

    return token;
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });
    } catch (error) {
      throw new Error('Invalid access token', error);
    }
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    try {
      // JWT 검증
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // DB에서 토큰 확인
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new Error('Invalid refresh token');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid refresh token : ', error);
    }
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.delete({
      where: { token },
    });
  }

  async generateTokenPair(user: { id: string; email: string; name?: string }) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15분
    };
  }
}
