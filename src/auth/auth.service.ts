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
import { generateImagePath } from 'src/common/utils/image-path';

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

    const hashedPassword = await bcrypt.hash(password, 10);

    // Prisma 트랜잭션 사용
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 사용자 생성
      const newUser = await tx.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          status: 'ONLINE',
        },
      });

      let finalUser = newUser;

      // 2. 프로필 이미지 처리 (이미지 업로드 실패 시 트랜잭션 롤백)
      if (profileImage) {
        const filePath = generateImagePath({
          file: profileImage,
          type: 'profile',
          key: newUser.id,
        });

        const uploadResult = await this.supabaseService.uploadImage(
          profileImage,
          filePath,
        );

        if (!uploadResult.url || !uploadResult.path) {
          throw new BadRequestException('프로필 이미지 업로드 실패');
        }

        finalUser = await tx.user.update({
          where: { id: newUser.id },
          data: {
            profileImageUrl: uploadResult.url,
            profileImagePath: uploadResult.path,
          },
        });
      }

      return finalUser;
    });

    return this.formatUserResponse(result);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      throw new BadRequestException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'ONLINE', lastActiveAt: new Date() },
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
