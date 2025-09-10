// mention/mention.controller.ts
import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { MentionService } from './mention.service';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from 'src/workspace/guards/workspace-member.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('workspaces/:slug/mentions')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class MentionController {
  constructor(private mentionService: MentionService) {}

  @Get()
  async getUserMentions(
    @CurrentUser('sub') userId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.mentionService.getUserMentions(
      userId,
      parseInt(page),
      parseInt(limit),
    );
  }

  @Post('read/all')
  async markAllMentionsAsRead(@CurrentUser('sub') userId: string) {
    return this.mentionService.markAllMentionsAsRead(userId);
  }

  @Get('unread/count')
  async getUnreadMentionCount(@CurrentUser('sub') userId: string) {
    return this.mentionService.getUnreadMentionCount(userId);
  }

  @Post(':mentionId/read')
  async markMentionAsRead(
    @CurrentUser('sub') userId: string,
    @Param('mentionId') mentionId: string,
  ) {
    return this.mentionService.markMentionAsRead(mentionId, userId);
  }
}
