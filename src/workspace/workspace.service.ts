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
    const slug = await this.generateUniqueWorkspaceSlug(this.prisma);

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug,
        ownerId: userId,
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

      finalWorkspace = await this.prisma.workspace.update({
        where: {
          id: workspace?.id,
        },
        data: { imageUrl: uploadResult?.url },
      });
      return finalWorkspace;
    }
  }

  private async generateUniqueWorkspaceSlug(prisma: PrismaService) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await prisma.workspace.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
  }
}
