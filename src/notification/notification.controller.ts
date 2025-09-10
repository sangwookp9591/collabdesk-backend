import {
  Controller,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Query,
  Patch,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { MarkAsReadDto } from './dto/mark-as-read.dto';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { GetNotificationQueryDto } from './dto/get-notificaiton-qeury.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  unread(
    @CurrentUser('sub') userId: string,
    @Query() dto: GetNotificationQueryDto,
  ) {
    return this.notificationService.findManay(userId, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Patch('mark')
  async mark(@Body() markAsReadDto: MarkAsReadDto) {
    await this.notificationService.markAsRead(markAsReadDto);
  }
}
