import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcryptjs';
import { UserStatus } from 'generated/prisma';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async register(registerDto: RegisterDto) {
    const { name, email, password } = registerDto;

    // 이메일 중복 체크
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('이미 존재하는 이메일입니다.');
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 12);

    // 사용자 생성
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        status: UserStatus.OFFLINE,
        lastActiveAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        status: true,
        createdAt: true,
      },
    });

    return { message: '회원가입이 완료되었습니다.', user };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    // 로그인 시 상태를 ONLINE으로 업데이트
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: UserStatus.ONLINE,
        lastActiveAt: new Date(),
      },
    });

    // 비밀번호 제외하고 반환
    return {
      ...user,
      status: UserStatus.ONLINE,
      lastActiveAt: new Date(),
    };
  }

  async findUserByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        status: true,
        lastActiveAt: true,
        lastActiveWorkspaceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
