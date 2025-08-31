import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { generateImagePath } from 'src/common/utils/image-path';
import { Prisma } from '@prisma/client';
import { InviteWorkspaceDto } from './dto/invite-workspace.dto';
import { WorkspaceInviteService } from './workspace-invite.service';

@Injectable()
export class WorkspaceService {
  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
    private workspaceInviteService: WorkspaceInviteService,
  ) {}

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

  async workspaceBySlug(slug: string, userId: string) {
    const workspaces = await this.prisma.workspaceMember.findMany({
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
    const currentWorkspace = await this.prisma.workspace.findUnique({
      where: {
        slug: slug,
      },
      include: {
        channels: true,
      },
    });

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

  async getMembersBySlug(slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        slug,
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

  async inviteWorkspace(userId: string, dto: InviteWorkspaceDto) {
    return await this.workspaceInviteService.inviteWorkspace(userId, dto);
  }

  async getInviteWorkspace(email: string, code: string) {
    return await this.workspaceInviteService.getInviteWorkspace(email, code);
  }

  async joinWorkspaceByCode(userId: string, email: string, code: string) {
    return await this.workspaceInviteService.joinWorkspaceByCode(
      userId,
      email,
      code,
    );
  }
}
