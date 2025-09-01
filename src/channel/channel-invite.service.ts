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
import { InviteStatus, WorkspaceRole } from '@prisma/client';
import { MailService } from 'src/mail/mail.service';
import { InviteRedisService } from 'src/redis/invite-redis.service';
import { generateShortCode } from 'src/common/utils/nanoid';
import { InviteChannelDto } from './dto/invite-channel.dto';
import { InviteExistingMembersDto } from './dto/invite-existing-members.dto';

@Injectable()
export class ChannelInviteService {
  private readonly logger = new Logger(ChannelInviteService.name);
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private inviteRedisService: InviteRedisService,
  ) {}

  // 채널 초대 생성
  async inviteChannel(userId: string, dto: InviteChannelDto) {
    const { email, workspaceId, channelId, channelRole } = dto;
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
      const isWorkspaceMember = await this.prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: isUser?.id,
            workspaceId,
          },
        },
      });
      if (isWorkspaceMember) {
        const isChannelMember = await this.prisma.channelMember.findUnique({
          where: {
            userId_channelId: {
              userId: isUser?.id,
              channelId,
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
    const { members } = dto;

    console.log('members', members);
    try {
      await this.prisma.$transaction(
        members.map((member) =>
          this.prisma.channelMember.create({
            data: {
              userId: member.userId,
              channelId: member.channelId,
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

  async joinChannelByCode(userId: string, email, code: string) {
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

  async removeChannelByCode(email: string, code: string) {
    const invite = await this.validateCode(code);
    if (invite.email !== email) {
      throw new UnauthorizedException('올바른 이메일이 아닙니다.');
    }
    await this.prisma.channelInvite.update({
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

    if (!invite) {
      throw new BadRequestException('초대 코드가 만료 되었습니다.');
    }

    if (invite.type !== 'channel') {
      throw new BadRequestException('해당 타입의 코드가 아닙니다.');
    }

    if (!invite.channelId) {
      throw new BadRequestException('요청을 처리할 수 없습니다.');
    }
    return invite;
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
