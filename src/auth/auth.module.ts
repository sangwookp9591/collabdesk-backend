import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';

@Module({
  imports: [PrismaModule, SupabaseModule, JwtTokenModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
