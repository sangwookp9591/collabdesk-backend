import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, SupabaseModule, JwtTokenModule],
  controllers: [UserController],
  providers: [UserService, JwtAuthGuard, JwtService],
})
export class UserModule {}
