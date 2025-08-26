import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { generateImagePath } from 'src/common/utils/image-path';

@Injectable()
export class WorkspaceService {
  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
  ) {}

  async create(
    dto: CreateWorkspaceDto,
    userId: string,
    image: Express.Multer.File | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const slug = await this.generateUniqueWorkspaceSlug(this.prisma);

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

      //기본 채널 생성
      const defaultChannel = await this.prisma.channel.create({
        data: {
          name: 'general',
          slug: channelSlug,
          workspaceId: workspace.id,
          createdById: userId,
          isDefault: true,
        },
      });

      // 채널 멤버 생성
      await this.prisma.channelMember.create({
        data: {
          channelId: defaultChannel.id,
          userId,
          role: 'ADMIN',
        },
      });

      let finalWorkspace = workspace;

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
        });
      }
      return finalWorkspace;
    });
  }

  private async generateUniqueWorkspaceSlug(prisma: PrismaService) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await prisma.workspace.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
  }

  private async generateUniqueChannelSlug(prisma: PrismaService) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await prisma.channel.findUnique({ where: { slug } });
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
}
