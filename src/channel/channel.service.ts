import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { nanoid } from 'nanoid';

@Injectable()
export class ChannelService {
  constructor(private prisma: PrismaService) {}

  async create(createChannelDto: CreateChannelDto, userId: string) {
    const slug = await this.generateUniqueChannelSlug(this.prisma);
    return this.prisma.channel.create({
      data: {
        name: createChannelDto.name,
        slug: slug,
        createdById: userId,
        workspaceId: createChannelDto.workspaceId,
        members: {
          create: {
            userId, // 생성자 자동 추가
            role: 'ADMIN', // 기본적으로 생성자는 ADMIN 등급
          },
        },
      },
    });
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

  private async generateUniqueChannelSlug(prisma: PrismaService) {
    while (true) {
      const slug = nanoid(8); // 8자리 랜덤 ID
      const exists = await prisma.channel.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
  }
}
