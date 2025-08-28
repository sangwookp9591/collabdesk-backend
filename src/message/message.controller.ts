import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { MessageService } from './message.service';

@Controller('message')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('channel:channelId')
  async getMessagesByChannel(@Param('channelId') channelId: string) {
    return await this.messageService.getMessagesByChannel(channelId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.messageService.remove(id);
  }
}
