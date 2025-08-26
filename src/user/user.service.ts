import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
  }

  async userWorkspace(id: string) {
    const workspaces = await this.prisma.workspaceMember.findMany({
      where: {
        userId: id,
      },
      select: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            members: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    return workspaces;
  }

  async lastWorkspace(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        lastActiveWorkspaceId: true,
      },
    });

    if (!user?.lastActiveWorkspaceId) {
      return {
        lastActiveWorkspaceId: user?.lastActiveWorkspaceId,
        workspaceSlug: null,
      };
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id: user?.lastActiveWorkspaceId,
      },
      select: {
        slug: true,
      },
    });

    return {
      lastActiveWorkspaceId: user?.lastActiveWorkspaceId,
      workspaceSlug: workspace?.slug,
    };
  }

  async updateLastWorkspaceId(userId: string, workspaceId: string) {
    const updateUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        lastActiveWorkspaceId: workspaceId,
      },
      select: {
        lastActiveWorkspaceId: true,
      },
    });

    if (updateUser.lastActiveWorkspaceId === workspaceId) {
      return {
        success: true,
      };
    } else {
      return {
        success: false,
      };
    }
  }
}
