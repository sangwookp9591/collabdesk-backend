// src/workspace/workspace-invite.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InviteStatus, WorkspaceRole } from '@prisma/client';
import { MailService } from 'src/mail/mail.service';
import { InviteRedisService } from 'src/redis/invite-redis.service';
import { generateShortCode } from 'src/common/utils/nanoid';

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
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private inviteRedisService: InviteRedisService,
  ) {}

  // 워크스페이스 초대 생성
  async inviteWorkspace(
    email: string,
    userId: string,
    workspaceId: string,
    workspaceRole: WorkspaceRole,
  ) {
    const inviterUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!inviterUser) {
      throw new NotFoundException('초대를 할 수 없는 유저입니다.');
    }

    const isUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (isUser) {
      //해당 워크스페이스가 이미 초대되어 있는지
      const isMember = await this.prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: isUser?.id,
            workspaceId,
          },
        },
      });
      if (isMember) {
        throw new ConflictException('이미 워크스페이스 멤버');
      }
    }

    // 이미 있으면 업데이트 후 재발송
    const existingInvite = await this.prisma.workspaceInvite.findFirst({
      where: {
        invitedById: userId,
        email: email,
        workspaceId: workspaceId,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    const ttl = 10 * 60;
    const newExpiresAt = new Date(Date.now() + ttl * 1000);
    const code = await this.generateUniqueWorkspaceInviteCode();

    if (existingInvite) {
      const updateWorkspaceInvite = await this.prisma.workspaceInvite.update({
        where: {
          id: existingInvite.id,
        },
        data: {
          code: code,
          expiresAt: newExpiresAt,
          status: InviteStatus.PENDING,
        },
        include: {
          workspace: true,
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      await this.inviteRedisService.setInviteCode(code, ttl, {
        type: 'workspace',
        inviteId: updateWorkspaceInvite.id,
        email: updateWorkspaceInvite.email,
        workspaceId: updateWorkspaceInvite.workspaceId,
        role: workspaceRole,
      });

      await this.mailService.sendWorkspaceInvite({
        to: email,
        inviterName: inviterUser?.name || '',
        workspaceName: updateWorkspaceInvite.workspace.name,
        code,
        expiresAt: newExpiresAt,
      });
    } else {
      const workspaceInvite = await this.prisma.workspaceInvite.create({
        data: {
          invitedById: userId,
          workspaceId,
          email,
          code,
          expiresAt: newExpiresAt,
        },
        include: {
          workspace: true,
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      await this.inviteRedisService.setInviteCode(code, ttl, {
        type: 'workspace',
        inviteId: workspaceInvite.id,
        email: workspaceInvite.email,
        workspaceId: workspaceInvite.workspaceId,
        role: workspaceRole,
      });

      await this.mailService.sendWorkspaceInvite({
        to: email,
        inviterName: inviterUser?.name || '',
        workspaceName: workspaceInvite.workspace.name,
        code,
        expiresAt: newExpiresAt,
      });
    }
  }

  async getInviteWorkspace(email: string, code: string) {
    const invite = await this.validateCode(code);

    if (invite.email !== email) {
      throw new UnauthorizedException('올바른 이메일이 아닙니다.');
    }

    return await this.prisma.workspace.findUnique({
      where: {
        id: invite.workspaceId,
      },
    });
  }

  async joinWorkspaceByCode(userId: string, email, code: string) {
    const invite = await this.validateCode(code);

    if (invite.email !== email) {
      throw new UnauthorizedException('올바른 이메일이 아닙니다.');
    }

    await this.prisma.workspaceInvite.update({
      where: {
        code,
      },
      data: {
        status: InviteStatus.ACCEPTED,
      },
    });

    return await this.prisma.workspaceMember.create({
      data: {
        userId: userId,
        workspaceId: invite.workspaceId,
        role: invite.role,
      },
    });
  }

  async removeWorkspaceByCode(email: string, code: string) {
    const invite = await this.validateCode(code);
    if (invite.email !== email) {
      throw new UnauthorizedException('올바른 이메일이 아닙니다.');
    }
    await this.prisma.workspaceInvite.update({
      where: {
        code,
      },
      data: {
        status: InviteStatus.DECLINED,
      },
    });
  }

  private async validateCode(code: string) {
    const invite = await this.inviteRedisService.getInviteCode(code);

    if (!invite || invite.type !== 'workspace') {
      throw new BadRequestException();
    }
    return invite;
  }

  private async generateUniqueWorkspaceInviteCode() {
    while (true) {
      const code = generateShortCode();

      const exists = await this.prisma.workspaceInvite.findUnique({
        where: { code },
      });
      if (!exists) return code;
    }
  }
}
