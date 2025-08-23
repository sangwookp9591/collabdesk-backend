import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateUser(@Body() loginDto: LoginDto) {
    return await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
  }
}
