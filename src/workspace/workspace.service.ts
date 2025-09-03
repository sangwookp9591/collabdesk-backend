import { Injectable, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { generateImagePath } from 'src/common/utils/image-path';
import { Prisma } from '@prisma/client';

@Injectable()
export class WorkspaceService {
  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
  ) {}

  async findManyByUserId(userId: string) {
    return await this.prisma.workspaceMember.findMany({
      where: {
        userId: userId,
      },
      select: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            members: {
              select: {
                id: true,
                userId: true,
                workspaceId: true,
                role: true,
                joinedAt: true,
                user: true,
              },
            },
          },
        },
      },
    });
  }

  async create(
    dto: CreateWorkspaceDto,
    userId: string,
    image: Express.Multer.File | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const slug = await this.generateUniqueWorkspaceSlug(tx);

      console.log('slug : ', slug, dto);
      const workspace = await tx.workspace.create({
        data: {
          name: dto.name,
          slug,
          ownerId: userId,
          members: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
      });

      const channelSlug = await this.generateUniqueChannelSlug(this.prisma);

      console.log('channelSlug : ', channelSlug);
      //기본 채널 생성
      const defaultChannel = await tx.channel.create({
        data: {
          name: 'general',
          slug: channelSlug,
          workspaceId: workspace.id,
          createdById: userId,
          isDefault: true,
        },
      });

      console.log('defaultChannel : ', defaultChannel);

      // 채널 멤버 생성
      const channel = await tx.channelMember.create({
        data: {
          channelId: defaultChannel.id,
          userId: userId,
          role: 'ADMIN',
        },
      });

      console.log('channel : ', channel);

      let finalWorkspace = workspace;

      console.log('finalWorkspace : ', finalWorkspace);

      if (image) {
        const filePath = generateImagePath({
          file: image,
          type: 'workspace',
          key: workspace?.id,
        });
        const uploadResult = await this.supabase.uploadImage(image, filePath);

        finalWorkspace = await tx.workspace.update({
          where: {
            id: workspace?.id,
          },
          data: { imageUrl: uploadResult?.url },
          include: {
            channels: true,
          },
        });
      }
      return finalWorkspace;
    });
  }

  async getUserWorkspaces(userId: string) {
    return await this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
    });
  }

  private async generateUniqueWorkspaceSlug(tx: Prisma.TransactionClient) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await tx.workspace.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
  }

  private async generateUniqueChannelSlug(tx: Prisma.TransactionClient) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await tx.channel.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
  }

  async getWorkspaceMembers(slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug: slug,
      },
    });

    if (!workspace) {
      throw new NotFoundException('워크스페이스를 찾지 못함');
    }
    return await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: workspace.id,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            profileImageUrl: true,
          },
        },
      },
    });
  }

  async getMyMembership(slug: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug: slug,
      },
    });

    if (!workspace) {
      throw new NotFoundException('워크스페이스를 찾지 못함');
    }
    return await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: workspace.id,
        },
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            profileImageUrl: true,
          },
        },
      },
    });
  }
  async getWorkspaceMemberById(slug: string, memberId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug: slug,
      },
    });

    if (!workspace) {
      throw new NotFoundException('워크스페이스를 찾지 못함');
    }
    return await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: memberId,
          workspaceId: workspace.id,
        },
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            profileImageUrl: true,
          },
        },
      },
    });
  }

  async getWorkspaceStats(slug: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });
    if (!workspace)
      throw new NotFoundException('워크스페이스를 찾을 수 없습니다.');

    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: workspace.id,
        },
      },
    });

    if (!member) throw new NotFoundException('워크스페이스를 멤버가 아닙니다.');

    const [channelCount, messageCount] = await Promise.all([
      this.prisma.channel.count({
        where: { workspaceId: workspace.id },
      }),
      this.prisma.message.count({
        where: {
          channel: { workspaceId: workspace.id },
        },
      }),
    ]);

    const onlineMembers = workspace.members.filter(
      (member) => member.user.status === 'ONLINE',
    ).length;

    return {
      totalChannels: channelCount,
      totalMembers: workspace.members.length,
      totalMessages: messageCount,
      onlineMembers,
    };
  }

  async workspaceBySlug(slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug: slug,
      },
      include: {
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return { ...workspace, memberCount: workspace?._count.members };
  }

  async workspaceInitBySlug(slug: string, userId: string) {
    const workspaces = await this.findManyByUserId(userId);
    const currentWorkspace = await this.workspaceBySlug(slug);

    return { workspaces, currentWorkspace };
  }

  async joinWorkspace(userId: string, workspaceId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 워크스페이스 멤버 추가
      await tx.workspaceMember.create({
        data: { userId, workspaceId, role: 'MEMBER' },
      });

      // Public 채널 자동 참여
      const publicChannels = await tx.channel.findMany({
        where: { workspaceId, isPublic: true },
      });

      await Promise.all(
        publicChannels.map((channel) =>
          tx.channelMember.upsert({
            where: { userId_channelId: { userId, channelId: channel.id } },
            update: {},
            create: { userId, channelId: channel.id, role: 'MEMBER' },
          }),
        ),
      );

      return { workspaceId, joinedPublicChannels: publicChannels.length };
    });
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    return !!member;
  }

  async getWorkspaceMember(workspaceId: string, userId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    return member;
  }

  async getUserChannels(workspaceId: string, userId: string) {
    return await this.prisma.channel.findMany({
      where: {
        workspaceId,
        members: {
          some: {
            userId: userId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isPublic: true,
      },
    });
  }

  async getMembersById(id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });
    return await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: workspace?.id,
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
}
