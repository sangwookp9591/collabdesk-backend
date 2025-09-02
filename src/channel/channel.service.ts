import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { nanoid } from 'nanoid';
import { ChannelInviteService } from './channel-invite.service';
import { InviteChannelDto } from './dto/invite-channel.dto';
import { InviteExistingMembersDto } from './dto/invite-existing-members.dto';
import { GetChannelsDto } from './dto/search-channels.dto';

@Injectable()
export class ChannelService {
  constructor(
    private prisma: PrismaService,
    private channelInviteService: ChannelInviteService,
  ) {}

  async findMany(userId, dto: GetChannelsDto) {
    const {
      workspaceId,
      search,
      orderBy = 'createdAt',
      page = 1,
      take = 20,
    } = dto;
    return await this.prisma.channel.findMany({
      where: {
        workspaceId: workspaceId,
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

  async create(createChannelDto: CreateChannelDto, userId: string) {
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
    if (channel.isPublic) {
      const members = await this.prisma.workspaceMember.findMany({
        where: { workspaceId: channel.workspaceId, userId: { not: userId } },
      });

      const joinOps = members.map((member) =>
        this.prisma.channelMember.upsert({
          where: {
            userId_channelId: { userId: member.userId, channelId: channel.id },
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
    }

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

    if (channel.isDefault) {
      throw new ForbiddenException('기본 채널은 삭제할 수 없습니다.');
    }

    if (channel.createdById !== userId) {
      throw new ForbiddenException('채널 삭제할수 없는 유저');
    }

    await this.prisma.channel.delete({
      where: {
        id: channel?.id,
      },
    });

    return { success: true, message: '삭제 성공', data: null };
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

  async inviteChannel(userId: string, dto: InviteChannelDto) {
    return await this.channelInviteService.inviteChannel(userId, dto);
  }

  async inviteExistingMembers(dto: InviteExistingMembersDto) {
    return await this.channelInviteService.inviteExistingMembers(dto);
  }

  async getInviteChannel(email: string, code: string) {
    return await this.channelInviteService.getInviteChannel(email, code);
  }

  async joinChannelByCode(userId: string, email: string, code: string) {
    return await this.channelInviteService.joinChannelByCode(
      userId,
      email,
      code,
    );
  }
  private async generateUniqueChannelSlug(prisma: PrismaService) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await prisma.channel.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
  }
}
