import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { nanoid } from 'nanoid';
import { GetChannelsDto } from './dto/search-channels.dto';
import {
  ChannelRole,
  MessageType,
  WorkspaceMember,
  WorkspaceRole,
} from '@prisma/client';
import { SocketService } from 'src/socket/socket.service';

@Injectable()
export class ChannelService {
  constructor(
    private prisma: PrismaService,
    private SocketService: SocketService,
  ) {}

  async getMyChaneels(userId: string, workspaceSlug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug: workspaceSlug,
      },
    });
    if (!workspace) {
      throw new NotFoundException('해당 워크스페이스가 존재하지 않습니다.');
    }
    const channels = await this.prisma.channel.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [
          {
            members: {
              some: {
                userId: userId,
              },
            },
          },
        ],
      },
      include: {
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return channels.map((channel) => ({
      ...channel,
      memberCount: channel._count.members,
    }));
  }

  async findMany(userId, workspaceSlug, dto: GetChannelsDto) {
    const { search, orderBy = 'createdAt', page = 1, take = 20 } = dto;
    return await this.prisma.channel.findMany({
      where: {
        slug: workspaceSlug,
        name: search ? { contains: search } : undefined,
        members: {
          some: {
            userId: userId,
          },
        },
      },
      orderBy: {
        [orderBy]: 'asc',
      },
      skip: (page - 1) * take,
      take: take,
    });
  }

  async create(
    createChannelDto: CreateChannelDto,
    userId: string,
    email: string | undefined,
    name: string | undefined,
  ) {
    // 1. 채널 생성
    const slug = await this.generateUniqueChannelSlug(this.prisma);
    const channel = await this.prisma.channel.create({
      data: {
        ...createChannelDto,
        createdById: userId,
        slug: slug,
      },
    });

    // 2. 채널 만든 유저는 자동 참여
    await this.prisma.channelMember.create({
      data: { userId, channelId: channel.id, role: 'ADMIN' },
    });

    // 3. Public 채널이면 기존 워크스페이스 멤버 전원 참여
    const members: WorkspaceMember[] = [];
    if (channel.isPublic) {
      const allMembers = await this.prisma.workspaceMember.findMany({
        where: { workspaceId: channel.workspaceId, userId: { not: userId } },
      });
      members.concat(allMembers);
    } else {
      const adminMembers = await this.prisma.workspaceMember.findMany({
        where: {
          workspaceId: channel.workspaceId,
          userId: { not: userId },
          role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.OWNER] },
        },
      });
      members.concat(adminMembers);
    }

    const joinOps = members.map((member) =>
      this.prisma.channelMember.upsert({
        where: {
          userId_channelId: {
            userId: member.userId,
            channelId: channel.id,
          },
        },
        update: {},
        create: {
          userId: member.userId,
          channelId: channel.id,
          role: 'MEMBER',
        },
      }),
    );

    await this.prisma.$transaction(joinOps);
    await this.prisma.message.create({
      data: {
        content: `${name ? name : email} 외 ${members.length > 0 ? members.length : `0`}명이 채널에 참가하였습니다.`,
        channelId: channel.id,
        messageType: MessageType.SYSTEM,
      },
    });
    await this.SocketService.publishChannelCreated(channel);
    return channel;
  }

  async findOne(slug: string) {
    return await this.prisma.channel.findUnique({
      where: { slug },
    });
  }

  async updateBySlug(
    slug: string,
    userId: string,
    updateChannelDto: UpdateChannelDto,
  ) {
    const channel = await this.prisma.channel.findUnique({
      where: {
        slug: slug,
      },
    });

    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }

    if (channel.isDefault) {
      throw new ForbiddenException('기본 채널은 수정할 수 없습니다.');
    }

    if (channel.createdById !== userId) {
      throw new ForbiddenException('채널 수정할 수 없는 유저');
    }
    const data: any = {};
    if (updateChannelDto.name !== undefined) data.name = updateChannelDto.name;
    if (updateChannelDto.description !== undefined)
      data.description = updateChannelDto.description;
    if (updateChannelDto.isPublic !== undefined)
      data.isPublic = updateChannelDto.isPublic;

    return this.prisma.channel.update({
      where: { slug },
      data,
    });
  }

  async removeBySlug(slug: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: {
        slug: slug,
      },
    });
    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }

    const channelMember = await this.prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId, channelId: channel.id },
      },
      select: {
        role: true,
      },
    });

    if (channel.isDefault) {
      throw new ForbiddenException('기본 채널은 삭제할 수 없습니다.');
    }
    const workspaceMember = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: channel?.workspaceId },
      },
      select: {
        role: true,
      },
    });

    if (
      !(
        workspaceMember?.role === WorkspaceRole.OWNER ||
        workspaceMember?.role === WorkspaceRole.ADMIN ||
        channelMember?.role === ChannelRole.ADMIN
      )
    ) {
      throw new ForbiddenException('채널 삭제할수 없는 유저');
    }

    const deleteChannel = await this.prisma.channel.delete({
      where: {
        id: channel?.id,
      },
    });

    await this.SocketService.publishChannelDelete({
      workspaceId: deleteChannel.workspaceId,
      channelId: deleteChannel.id,
      userId: userId,
      message: `${userId}에 의해 ${deleteChannel.name} 채널 삭제`,
    });

    return deleteChannel;
  }

  async isMember(channelId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId,
          channelId,
        },
      },
    });
    return !!member;
  }

  async getMembersBySlug(slug: string) {
    const channel = await this.prisma.channel.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    });
    return await this.prisma.channelMember.findMany({
      where: {
        channelId: channel?.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
          },
        },
      },
    });
  }

  async getMemberByMemberId(slug: string, memberId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    });

    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
    return await this.prisma.channelMember.findUnique({
      where: {
        userId_channelId: {
          userId: memberId,
          channelId: channel.id,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
          },
        },
      },
    });
  }

  private async generateUniqueChannelSlug(prisma: PrismaService) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await prisma.channel.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
  }
}
