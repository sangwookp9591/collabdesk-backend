import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DmService } from './dm.service';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from 'src/workspace/guards/workspace-member.guard';
import type { Request } from 'express';
import { CreateDmDto } from './dto/create-dm.dto';
import { GetMessagesQueryDto } from './dto/get-message-by-dm';
import { MessageService } from '../message/message.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@Controller('workspaces/:slug/dm')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class DmController {
  constructor(
    private readonly dmService: DmService,
    private readonly messageService: MessageService,
  ) {}

  @Get('conversations')
  getUserDmConversations(
    @Req() req: Request,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const userId = req.user?.sub;
    return this.dmService.getUserDmConversations(userId, workspaceSlug);
  }

  @Get('conversations/recent')
  getUserDmConversationsRecent(
    @Req() req: Request,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const userId = req.user?.sub;
    return this.dmService.getUserDmConversationsRecent(userId, workspaceSlug);
  }

  @Post('conversations')
  createDmConversations(
    @Req() req: Request,
    @Param('workspaceSlug') workspaceSlug: string,
    @Body()
    dto: CreateDmDto,
  ) {
    const userId = req.user?.sub;
    const { otherUserId } = dto;
    return this.dmService.createDmConversations(
      userId,
      otherUserId,
      workspaceSlug,
    );
  }

  @Get('conversations/:conversationId')
  getDmConversation(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
  ) {
    return this.dmService.getDmConversation(conversationId);
  }

  @Get('conversations/:conversationId/messages')
  getDmMessages(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Query() dto: GetMessagesQueryDto,
  ) {
    return this.dmService.getDmMessages(conversationId, dto);
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 1분에 60개 메시지 제한
  @ApiOperation({ summary: 'DM 메시지 전송' })
  @ApiResponse({
    status: 201,
    description: '메시지가 성공적으로 전송되었습니다.',
  })
  @ApiResponse({ status: 403, description: 'DM 접근 권한이 없습니다.' })
  @ApiResponse({ status: 429, description: '요청 한도를 초과했습니다.' })
  async createMessage(
    @CurrentUser('sub') userId: string,
    @Body()
    createMessageDto: {
      content: string;
      mentionIds: string[];
      parentId?: string;
    },
    @Param('slug') slug: string,
    @Param('conversationId') conversationId: string,
  ) {
    return await this.messageService.createMessage(userId, {
      slug: slug,
      dmConversationId: conversationId,
      content: createMessageDto.content,
      parentId: createMessageDto.parentId,
      mentionIds: createMessageDto.mentionIds ?? [],
    });
  }

  @Get('conversations/:conversationId/messages/unread')
  async getUnreadDMCount(@CurrentUser('sub') userId: string) {
    return this.dmService.getUnreadDMCount(userId);
  }
}
