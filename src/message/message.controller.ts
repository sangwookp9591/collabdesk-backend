import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { MessageService } from './message.service';
import { GetMessagesQueryDto } from './dto/get-message-by-channel';
import type { Request } from 'express';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('workspaces/:slug/channels/:channelSlug/messages')
  async getMessagesByChannel(
    @Param('slug') slug: string,
    @Param('channelSlug') channelSlug: string,
    @Query() dto: GetMessagesQueryDto,
  ) {
    return await this.messageService.getMessagesByChannel(channelSlug, dto);
  }

  @Get('workspaces/:slug/messages/recent')
  async getRecentMessages(
    @Req() req: Request,
    @Query('workspaceSlug') workspaceSlug: string,
    @Query('take') take?: string,
  ) {
    const userId = req.user.sub;
    return await this.messageService.getRecentMessages(
      userId,
      workspaceSlug,
      Number(take ?? 10),
    );
  }

  @Delete('messages/:id')
  async remove(@Param('id') id: string) {
    return await this.messageService.remove(id);
  }
}
