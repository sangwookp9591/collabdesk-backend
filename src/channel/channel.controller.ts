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
} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request } from 'express';
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

  @Get('my')
  async getMyChannels(
    @Req() req: Request,
    @Query('workspaceSlug') workspaceSlug: string,
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

  @Delete(':id')
  async removeBySlug(@Req() req: Request, @Param('id') id: string) {
    const userId = req.user.sub;
    return await this.channelService.removeBySlug(id, userId);
  }

  @Get(':id/members')
  async getMembersById(@Param('id') id: string) {
    return await this.channelService.getMembersById(id);
  }
}
