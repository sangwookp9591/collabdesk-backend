import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { MessageService } from './message.service';
import { GetMessagesQueryDto } from './dto/get-message-by-channel';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { WorkspaceMemberGuard } from 'src/workspace/guards/workspace-member.guard';
@Controller()
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('workspaces/:slug/channels/:channelSlug/messages')
  @UseGuards(WorkspaceMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 1분에 60개 메시지 제한
  @ApiOperation({ summary: '메시지 전송' })
  @ApiResponse({
    status: 201,
    description: '메시지가 성공적으로 전송되었습니다.',
  })
  @ApiResponse({ status: 403, description: '채널/DM 접근 권한이 없습니다.' })
  @ApiResponse({ status: 429, description: '요청 한도를 초과했습니다.' })
  async createMessage(
    @CurrentUser('sub') userId: string,
    @Body()
    createMessageDto: {
      content: string;
      parentId?: string;
      mentionIds?: string[];
    },
    @Param('slug') slug: string,
    @Param('channelSlug') channelSlug: string,
  ) {
    return await this.messageService.createMessage(userId, {
      slug: slug,
      channelSlug: channelSlug,
      content: createMessageDto.content,
      parentId: createMessageDto.parentId,
      mentionIds: createMessageDto.mentionIds,
    });
  }

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
    @Param('slug') slug: string,
    @Query('take') take: string = '10',
  ) {
    const userId = req.user.sub;
    return await this.messageService.getRecentMessages(
      userId,
      slug,
      parseInt(take),
    );
  }

  @Delete('messages/:id')
  async remove(@Param('id') id: string) {
    return await this.messageService.remove(id);
  }
}
