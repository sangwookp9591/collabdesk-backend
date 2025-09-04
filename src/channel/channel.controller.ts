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
  Query,
  Logger,
} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request } from 'express';
import { GetChannelsDto } from './dto/search-channels.dto';

@Controller('workspaces/:workspaceSlug/channels')
@UseGuards(JwtAuthGuard)
export class ChannelController {
  private readonly logger = new Logger(ChannelController.name);
  constructor(private readonly channelService: ChannelService) {}

  @Get()
  async findMany(
    @Req() req: Request,
    @Param('workspaceSlug') workspaceSlug: string,
    @Query() dto: GetChannelsDto,
  ) {
    const userId = req.user.id;
    return await this.channelService.findMany(userId, workspaceSlug, dto);
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

  @Get('my')
  async getMyChannels(
    @Req() req: Request,
    @Param('workspaceSlug') workspaceSlug: string,
  ) {
    const userId = req.user?.sub;

    return await this.channelService.getMyChaneels(userId, workspaceSlug);
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

  @Get(':slug/members')
  async getMembersBySlug(@Param('slug') slug: string) {
    return await this.channelService.getMembersBySlug(slug);
  }

  @Get(':slug/members/:memberId')
  async getMemberById(
    @Param('slug') slug: string,
    @Param('memberId') memberId: string,
  ) {
    return await this.channelService.getMemberByMemberId(slug, memberId);
  }
}
