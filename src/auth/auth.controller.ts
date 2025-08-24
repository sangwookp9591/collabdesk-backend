// auth.controller.ts
import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ValidationPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, callback) => {
        if (!file) {
          return callback(null, true);
        }

        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException(
              'JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async signup(
    @Body('email') email: string,
    @Body('name') name: string,
    @Body('password') password: string,
    @Body('confirmPassword') confirmPassword: string,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    console.log('signup called:', {
      email,
      name,
      password,
      confirmPassword,
      profileImage,
    });

    // 수동으로 DTO 생성 및 검증
    const signupDto = new SignupDto();
    signupDto.email = email;
    signupDto.name = name;
    signupDto.password = password;

    // 수동 검증 (또는 class-validator 사용)
    if (!email || !name || !password || !confirmPassword) {
      throw new BadRequestException('필수 필드가 누락되었습니다.');
    }

    const user = await this.authService.signup(signupDto, profileImage);

    return {
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: user,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(ValidationPipe) loginDto: LoginDto) {
    const user = await this.authService.login(loginDto);

    return {
      success: true,
      message: '로그인에 성공했습니다.',
      data: user,
    };
  }
}
