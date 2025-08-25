import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  async userWorkspace(id: string) {
    const workspaces = await this.prisma.workspaceMember.findMany({
      where: {
        userId: id,
      },
      select: {
        workspace: {
          select: {
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
    return await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        lastActiveWorkspaceId: true,
      },
    });
  }
}
