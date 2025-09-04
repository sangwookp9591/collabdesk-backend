import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { JwtTokenModule } from 'src/jwt-token/jwt-token.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';

@Module({
  imports: [PrismaModule, SupabaseModule, JwtTokenModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceMemberGuard],
  exports: [WorkspaceService, WorkspaceMemberGuard],
})
export class WorkspaceModule {}
