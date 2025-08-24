// auth.service.ts
import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private supabaseService: SupabaseService,
  ) {}

  async signup(
    signupDto: SignupDto,
    profileImage?: Express.Multer.File,
  ): Promise<AuthResponseDto> {
    const { email, name, password } = signupDto;

    // 이메일 중복 확인
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    try {
      // 비밀번호 해시화
      const hashedPassword = await bcrypt.hash(password, 10);

      // 먼저 사용자 생성
      const newUser = await this.prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          status: 'ONLINE',
        },
      });

      let finalUser = newUser;

      // 프로필 이미지 처리
      if (profileImage) {
        try {
          const uploadResult = await this.supabaseService.uploadProfileImage(
            profileImage,
            newUser.id,
          );

          // 사용자 정보에 이미지 URL과 경로 업데이트
          finalUser = await this.prisma.user.update({
            where: { id: newUser.id },
            data: {
              profileImageUrl: uploadResult.url,
              profileImagePath: uploadResult.path,
            },
          });
        } catch (imageError) {
          // 이미지 업로드 실패해도 회원가입은 성공
          console.error('프로필 이미지 업로드 실패:', imageError);
        }
      }

      return this.formatUserResponse(finalUser);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(
        `회원가입에 실패했습니다: ${error.message}`,
      );
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // 사용자 찾기
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      throw new BadRequestException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    // 사용자 상태를 ONLINE으로 업데이트
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ONLINE',
        lastActiveAt: new Date(),
      },
    });

    return this.formatUserResponse(updatedUser);
  }

  private formatUserResponse(user: any): AuthResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      profileImageUrl: user.profileImageUrl,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
