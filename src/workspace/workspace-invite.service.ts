// src/workspace/workspace-invite.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkspaceRole } from '@prisma/client';

export interface CreateWorkspaceInviteDto {
  email: string;
  workspaceId: string;
  role?: WorkspaceRole;
}

export interface AcceptInviteDto {
  code: string;
}

@Injectable()
export class WorkspaceInviteService {
  constructor(private prisma: PrismaService) {}

  // 워크스페이스 초대 생성
}
