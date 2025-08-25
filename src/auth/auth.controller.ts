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
  UnauthorizedException,
  Res,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
    @Body() signupDto: SignupDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    const { email, name, password, confirmPassword } = signupDto;
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
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.login(loginDto);
    // 쿠키에 Refresh Token 심기
    if (user.refreshToken) {
      res.cookie('refreshToken', user.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: user.expiresIn! * 1000, // expiresIn 초 단위
      });
    }

    delete user.refreshToken;

    return {
      success: true,
      message: '로그인에 성공했습니다.',
      data: user,
    };
  }

  @Post('refresh')
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies['refreshToken'];

    console.log('refreshToken : ', refreshToken);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const response = await this.authService.refreshTokens(
      refreshToken as string,
    );

    if (!response?.refreshToken) {
      return {
        success: false,
        message: 'refresh token 갱신 실팬',
        data: null,
      };
    }

    res.cookie('refreshToken', response.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: response.expiresIn * 1000, // expiresIn 초 단위
    });

    return {
      success: true,
      message: '토큰갱신에 성공했습니다.',
      data: { accessToken: response.accessToken },
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refreshToken'];
    console.log('refreshToken : ', refreshToken);
    if (refreshToken) {
      await this.authService.logout(refreshToken as string);
      res.clearCookie('refreshToken', { path: '/' });
    }
    return { message: 'Logged out successfully' };
  }
}
