import { Module } from '@nestjs/common';
import { JwtTokenService } from './jwt-token.service';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { WsJwtAuthGuard } from './guards/ws-jwt-auth.guard';

@Module({
  providers: [JwtTokenService, JwtService, JwtAuthGuard, WsJwtAuthGuard],
  exports: [JwtTokenService, JwtAuthGuard, WsJwtAuthGuard, JwtService],
})
export class JwtTokenModule {}
