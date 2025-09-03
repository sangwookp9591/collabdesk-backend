import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { InviteService } from './invite.service';
import { InviteWorkspaceDto } from './dto/invite-workspace.dto';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request } from 'express';
import { InviteExistingMembersDto } from './dto/invite-existing-members.dto';
import { InviteChannelDto } from './dto/invite-channel.dto';

@Controller('invite')
@UseGuards(JwtAuthGuard)
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @Get('workspace')
  async getInviteWorkspace(@Req() req: Request, @Query('code') code: string) {
    const email = req.user?.email;
    if (!email) {
      throw new UnauthorizedException('이메일 정보가 없습니다.');
    }

    if (!(code && code.length === 6)) {
      throw new BadRequestException('잘못된 요청입니다.');
    }

    return await this.inviteService.getInviteWorkspace(email, code);
  }

  @Post('workspace')
  async inviteWorkspace(
    @Req() req: Request,
    @Body(ValidationPipe) dto: InviteWorkspaceDto,
  ) {
    const userId = req.user?.sub;
    return await this.inviteService.inviteWorkspace(userId, dto);
  }

  @Post('workspace/join')
  async joinWorkspaceByCode(@Req() req: Request, @Body('code') code: string) {
    const userId = req.user?.sub;
    const email = req.user?.email;
    if (!(userId && email)) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.inviteService.joinWorkspaceByCode(userId, email, code);
  }

  @Get('channel')
  async getInviteChannel(@Req() req: Request, @Query('code') code: string) {
    const email = req.user?.email;
    if (!email) {
      throw new UnauthorizedException('이메일 정보가 없습니다.');
    }

    if (!(code && code.length === 6)) {
      throw new BadRequestException('잘못된 요청입니다.');
    }

    return await this.inviteService.getInviteChannel(email, code);
  }

  @Post('channel')
  async inviteChannel(
    @Req() req: Request,
    @Body(ValidationPipe) dto: InviteChannelDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.inviteService.inviteChannel(userId, dto);
  }

  @Post('channel/members')
  async inviteExistingMembers(
    @Req() req: Request,
    @Body() dto: InviteExistingMembersDto,
  ) {
    const userId = req.user?.sub;
    const email = req.user?.email;
    if (!(userId && email)) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.inviteService.inviteExistingMembers(dto);
  }

  @Post('channel/join')
  async joinChannelByCode(@Req() req: Request, @Body('code') code: string) {
    const userId = req.user?.sub;
    const email = req.user?.email;
    if (!(userId && email)) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.inviteService.joinChannelByCode(userId, email, code);
  }
}
