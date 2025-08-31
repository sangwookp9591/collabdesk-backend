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
} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('channel')
@UseGuards(JwtAuthGuard)
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post()
  async reate(@Req() req: Request, @Body() createChannelDto: CreateChannelDto) {
    const userId = req.user!.sub;
    return await this.channelService.create(createChannelDto, userId);
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
    const userId = req.user!.sub;
    return await this.channelService.updateBySlug(
      slug,
      userId,
      updateChannelDto,
    );
  }

  @Delete(':slug')
  async removeBySlug(@Req() req: Request, @Param('slug') slug: string) {
    const userId = req.user!.sub;
    return await this.channelService.removeBySlug(slug, userId);
  }

  @Get(':slug/members')
  async getMembersBySlug(@Param('slug') slug: string) {
    return await this.channelService.getMembersBySlug(slug);
  }
}
