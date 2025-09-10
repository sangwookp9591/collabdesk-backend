import { Injectable } from '@nestjs/common';
import { MarkAsReadDto } from './dto/mark-as-read.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetNotificationQueryDto } from './dto/get-notificaiton-qeury.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}
  async markAsRead(dto: MarkAsReadDto) {
    await this.prisma.notification.update({
      where: {
        id: dto.id,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async findManay(userId: string, dto: GetNotificationQueryDto) {
    const take = dto?.take ?? 10;
    const isRead = dto?.isRead ?? false;

    const whereMap = {};
    if (dto?.workspaceId) {
      whereMap['workspaceId'] = dto.workspaceId;
    }
    return await this.prisma.notification.findMany({
      where: {
        userId: userId,
        isRead: isRead,
        ...whereMap,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: take,
    });
  }
}
