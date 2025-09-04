import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WorkspaceService } from '../workspace.service';

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private workspaceService: WorkspaceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.user?.sub;
    const slug = req.params.slug;

    if (!userId || !slug) return false;

    const member = await this.workspaceService.getWorkspaceMemberById(
      slug,
      userId,
    );
    if (!member) {
      throw new ForbiddenException(
        '해당 유저는 워크스페이스 접근 권한이 없습니다.',
      );
    }

    return true;
  }
}
