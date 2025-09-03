// src/workspace/workspace-invite.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChannelRole, InviteStatus, WorkspaceRole } from '@prisma/client';
import { MailService } from 'src/mail/mail.service';
import { InviteRedisService } from 'src/redis/invite-redis.service';
import { generateShortCode } from 'src/common/utils/nanoid';
import { InviteWorkspaceDto } from './dto/invite-workspace.dto';
import { InviteExistingMembersDto } from './dto/invite-existing-members.dto';
import { InviteChannelDto } from './dto/invite-channel.dto';

export interface CreateWorkspaceInviteDto {
  email: string;
  workspaceId: string;
  role?: WorkspaceRole;
}

export interface AcceptInviteDto {
  code: string;
}

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private inviteRedisService: InviteRedisService,
  ) {}

  // 워크스페이스 초대 생성
  async inviteWorkspace(userId: string, dto: InviteWorkspaceDto) {
    const { email, workspaceId, workspaceRole } = dto;
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
        slug: updateWorkspaceInvite.workspace?.slug,
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
        slug: workspaceInvite.workspace.slug,
        inviterName: inviterUser?.name || '',
        workspaceName: workspaceInvite.workspace.name,
        code,
        expiresAt: newExpiresAt,
      });
    }
  }

  async getInviteWorkspace(email: string, code: string) {
    const invite = await this.validateCode(code);

    console.log('invite2 : ', invite);
    if (invite.email !== email) {
      throw new UnauthorizedException('올바른 이메일이 아닙니다.');
    }

    this.logger.log('getInviteWorkspace invite!!!! : ', invite.email);
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

    return await this.prisma.$transaction(async (tx) => {
      await tx.workspaceInvite.update({
        where: {
          code,
        },
        data: {
          status: InviteStatus.ACCEPTED,
        },
      });
      const createWorkspaceMember = await tx.workspaceMember.create({
        data: {
          userId: userId,
          workspaceId: invite.workspaceId,
          role: invite.role,
        },
      });

      const channels = await tx.channel.findMany({
        where: {
          workspaceId: createWorkspaceMember.workspaceId,
        },
        select: {
          id: true,
          isPublic: true,
        },
      });

      await Promise.all(
        channels.map((channel) => {
          // private 채널인데 일반 멤버라면 skip
          if (
            !channel.isPublic &&
            !(invite.role === 'OWNER' || invite.role === 'ADMIN')
          ) {
            return;
          }

          return tx.channelMember.upsert({
            where: {
              userId_channelId: {
                userId,
                channelId: channel.id,
              },
            },
            update: {},
            create: {
              userId,
              channelId: channel.id,
              role:
                invite.role === 'OWNER' || invite.role === 'ADMIN'
                  ? ChannelRole.ADMIN
                  : ChannelRole.MEMBER,
            },
          });
        }),
      );

      return createWorkspaceMember;
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

  /**채널 파트 */

  // 채널 초대 생성
  async inviteChannel(userId: string, dto: InviteChannelDto) {
    const { email, workspaceSlug, channelSlug, channelRole } = dto;
    const inviterUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!inviterUser) {
      throw new NotFoundException('초대를 할 수 없는 유저입니다.');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug: workspaceSlug,
      },
    });

    if (!workspace) {
      throw new NotFoundException('워크스페이스가 존재하지 않습니다.');
    }

    const channel = await this.prisma.channel.findUnique({
      where: {
        slug: channelSlug,
      },
    });

    if (!channel) {
      throw new NotFoundException('채널이 존재하지 않습니다.');
    }

    const isUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    const workspaceId = workspace?.id;
    const channelId = channel?.id;

    if (isUser) {
      //해당 워크스페이스가 이미 초대되어 있는지
      const isWorkspaceMember = await this.prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: isUser?.id,
            workspaceId: workspace?.id,
          },
        },
      });
      if (isWorkspaceMember) {
        const isChannelMember = await this.prisma.channelMember.findUnique({
          where: {
            userId_channelId: {
              userId: isUser?.id,
              channelId: channel?.id,
            },
          },
        });
        if (isChannelMember) {
          throw new ConflictException('이미 채널 맴버입니다.');
        }

        // 이미 워크스페이스 멤버면 즉시 초대
        return await this.prisma.channelMember.create({
          data: {
            userId: isUser?.id,
            channelId: channelId,
            role: channelRole,
          },
        });
      }
    }
    //워크스페이스에 없는 유저

    // 이미 있으면 업데이트 후 재발송
    const existingInvite = await this.prisma.channelInvite.findFirst({
      where: {
        invitedById: userId,
        email: email,
        channelId: channelId,
      },
    });

    const ttl = 10 * 60;
    const newExpiresAt = new Date(Date.now() + ttl * 1000);
    const code = await this.generateUniqueChannelInviteCode();

    if (existingInvite) {
      const updateChannelInvite = await this.prisma.channelInvite.update({
        where: {
          id: existingInvite.id,
        },
        data: {
          code: code,
          expiresAt: newExpiresAt,
          status: InviteStatus.PENDING,
        },
        include: {
          channel: {
            include: {
              workspace: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                },
              },
            },
          },
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
        inviteId: updateChannelInvite.id,
        email: updateChannelInvite.email,
        workspaceId: workspaceId,
        channelId: channelId,
        role: WorkspaceRole.GUEST,
        channelRole: channelRole,
      });

      await this.mailService.sendChannelInvite({
        to: email,
        slug: updateChannelInvite.channel.workspace.slug,
        inviterName: inviterUser?.name || '',
        workspaceName: updateChannelInvite.channel.workspace.name,
        channelName: updateChannelInvite.channel.name,
        code,
        expiresAt: newExpiresAt,
        isGuestInvite: true,
      });
    } else {
      const channelInvite = await this.prisma.channelInvite.create({
        data: {
          invitedById: userId,
          channelId,
          email,
          code,
          expiresAt: newExpiresAt,
          isGuestInvite: true,
        },
        include: {
          channel: {
            include: {
              workspace: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                },
              },
            },
          },
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      await this.inviteRedisService.setInviteCode(code, ttl, {
        type: 'channel',
        inviteId: channelInvite.id,
        email: channelInvite.email,
        workspaceId: workspaceId,
        channelId: channelId,
        role: WorkspaceRole.GUEST,
        channelRole: channelRole,
      });

      await this.mailService.sendChannelInvite({
        to: email,
        slug: channelInvite.channel.workspace.slug,
        inviterName: inviterUser?.name || '',
        workspaceName: channelInvite.channel.workspace.name,
        channelName: channelInvite.channel.name,
        code,
        expiresAt: newExpiresAt,
        isGuestInvite: true,
      });
    }
  }

  async inviteExistingMembers(dto: InviteExistingMembersDto) {
    const { members, channelSlug } = dto;

    const channel = await this.prisma.channel.findUnique({
      where: {
        slug: channelSlug,
      },
    });

    if (!channel) {
      throw new NotFoundException('채널이 존재하지 않습니다.');
    }
    const channelId = channel.id;

    try {
      await this.prisma.$transaction(
        members.map((member) =>
          this.prisma.channelMember.create({
            data: {
              userId: member.userId,
              channelId: channelId,
              role: member.role,
            },
          }),
        ),
      );

      return { success: true, message: '모든 멤버 초대 완료' };
    } catch (error) {
      // 하나라도 실패하면 전체 롤백
      throw new Error(`초대 실패: ${error.message}`);
    }
  }
  async getInviteChannel(email: string, code: string) {
    const invite = await this.validateCode(code);

    if (invite.email !== email) {
      throw new UnauthorizedException('올바른 이메일이 아닙니다.');
    }

    this.logger.log('getInviteChannel invite!!!! : ', invite.email);
    return await this.prisma.channel.findUnique({
      where: {
        id: invite.channelId,
      },
    });
  }

  async joinChannelByCode(userId: string, email: string, code: string) {
    const invite = await this.validateCode(code);

    if (invite.email !== email) {
      throw new UnauthorizedException('올바른 이메일이 아닙니다.');
    }
    return await this.prisma.$transaction(async (tx) => {
      await tx.channelInvite.update({
        where: {
          code,
        },
        data: {
          status: InviteStatus.ACCEPTED,
        },
      });
      //워크스페이스 생성
      await tx.workspaceMember.create({
        data: {
          userId: userId,
          workspaceId: invite.workspaceId,
          role: invite.role,
        },
      });

      // 채널 생성
      return tx.channelMember.upsert({
        where: {
          userId_channelId: {
            userId,
            channelId: invite.channelId!,
          },
        },
        update: {},
        create: {
          userId,
          channelId: invite.channelId!,
          role: invite.channelRole || 'MEMBER',
        },
      });
    });
  }

  private async validateCode(code: string) {
    const invite = await this.inviteRedisService.getInviteCode(code);

    if (!invite) {
      // Redis에서 키를 찾을 수 없으면 만료된 것
      throw new BadRequestException('초대 코드가 만료되었습니다.');
    }

    if (invite.type !== 'workspace') {
      throw new BadRequestException('잘못된 초대 코드입니다.');
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

  private async generateUniqueChannelInviteCode() {
    while (true) {
      const code = generateShortCode();

      const exists = await this.prisma.channelInvite.findUnique({
        where: { code },
      });
      if (!exists) return code;
    }
  }
}
