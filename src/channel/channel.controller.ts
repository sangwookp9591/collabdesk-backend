import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UnauthorizedException,
  BadRequestException,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request } from 'express';
import { InviteChannelDto } from './dto/invite-channel.dto';
import { InviteExistingMembersDto } from './dto/invite-existing-members.dto';
import { GetChannelsDto } from './dto/search-channels.dto';

@Controller('channel')
@UseGuards(JwtAuthGuard)
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Get()
  async findMany(@Req() req: Request, @Query() dto: GetChannelsDto) {
    const userId = req.user.id;
    return await this.channelService.findMany(userId, dto);
  }

  @Post()
  async create(
    @Req() req: Request,
    @Body() createChannelDto: CreateChannelDto,
  ) {
    const userId = req.user.sub;
    const email = req.user?.email;
    const name = req.user?.name;
    return await this.channelService.create(
      createChannelDto,
      userId,
      email,
      name,
    );
  }

  @Get('invite')
  async getInviteChannel(@Req() req: Request, @Query('code') code: string) {
    const email = req.user?.email;
    if (!email) {
      throw new UnauthorizedException('이메일 정보가 없습니다.');
    }

    if (!(code && code.length === 6)) {
      throw new BadRequestException('잘못된 요청입니다.');
    }

    return await this.channelService.getInviteChannel(email, code);
  }

  @Post('invite')
  async inviteChannel(
    @Req() req: Request,
    @Body(ValidationPipe) dto: InviteChannelDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.channelService.inviteChannel(userId, dto);
  }

  @Post('invite/members')
  async inviteExistingMembers(
    @Req() req: Request,
    @Body() dto: InviteExistingMembersDto,
  ) {
    const userId = req.user?.sub;
    const email = req.user?.email;
    if (!(userId && email)) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.channelService.inviteExistingMembers(dto);
  }

  @Post('invite/join')
  async joinChannelByCode(@Req() req: Request, @Body('code') code: string) {
    const userId = req.user?.sub;
    const email = req.user?.email;
    if (!(userId && email)) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.channelService.joinChannelByCode(userId, email, code);
  }

  @Get(':slug')
  async findOne(@Req() req: Request, @Param('slug') slug: string) {
    return await this.channelService.findOne(slug);
  }

  @Patch(':slug')
  async updateBySlug(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Body() updateChannelDto: UpdateChannelDto,
  ) {
    const userId = req.user.sub;
    return await this.channelService.updateBySlug(
      slug,
      userId,
      updateChannelDto,
    );
  }

  @Delete(':slug')
  async removeBySlug(@Req() req: Request, @Param('slug') slug: string) {
    const userId = req.user.sub;
    return await this.channelService.removeBySlug(slug, userId);
  }

  @Get(':id/members')
  async getMembersById(@Param('id') id: string) {
    return await this.channelService.getMembersById(id);
  }
}
