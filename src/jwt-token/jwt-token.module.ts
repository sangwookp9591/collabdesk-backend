import { Module } from '@nestjs/common';
import { JwtTokenService } from './jwt-token.service';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  providers: [JwtTokenService, JwtService, JwtAuthGuard],
  exports: [JwtTokenService, JwtAuthGuard],
})
export class JwtTokenModule {}
