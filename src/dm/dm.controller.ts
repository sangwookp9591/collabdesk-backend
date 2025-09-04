import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { DmService } from './dm.service';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from 'src/workspace/guards/workspace-member.guard';
import type { Request } from 'express';
import { CreateDmDto } from './dto/create-dm.dto';
import { GetMessagesQueryDto } from './dto/get-message-by-dm';

@Controller('workspaces/:workspaceSlug/dm')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class DmController {
  constructor(private readonly dmService: DmService) {}

  @Get()
  getUserDmConversations(
    @Req() req: Request,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const userId = req.user?.sub;
    return this.dmService.getUserDmConversations(userId, workspaceSlug);
  }

  @Post()
  createDmConversations(
    @Req() req: Request,
    @Param('workspaceSlug') workspaceSlug: string,
    @Body()
    dto: CreateDmDto,
  ) {
    const userId = req.user?.sub;
    const { targetUserId } = dto;
    return this.dmService.createDmConversations(
      userId,
      targetUserId,
      workspaceSlug,
    );
  }

  @Get(':dmId')
  getDmConversation(@Req() req: Request, @Param('dmId') dmId: string) {
    return this.dmService.getDmConversation(dmId);
  }

  @Get(':dmId/messages')
  getDmMessages(
    @Req() req: Request,
    @Param('dmId') dmId: string,
    @Query() dto: GetMessagesQueryDto,
  ) {
    return this.dmService.getDmMessages(dmId, dto);
  }
}
