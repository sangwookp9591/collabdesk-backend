import { Module } from '@nestjs/common';
import { DmService } from './dm.service';
import { DmController } from './dm.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { WorkspaceModule } from 'src/workspace/workspace.module';

@Module({
  imports: [WorkspaceModule, PrismaModule, JwtTokenModule],
  controllers: [DmController],
  providers: [DmService],
})
export class DmModule {}
