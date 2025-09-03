import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { InviteWorkspaceDto } from './dto/invite-workspace.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, callback) => {
        if (!file) {
          return callback(null, true);
        }

        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException(
              'JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async create(
    @Req() req: Request,
    @Body() dto: CreateWorkspaceDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const userId = req.user?.sub;

    if (!userId) {
      return {
        success: false,
        message: '세션 정보 없음.',
        data: { workspace: null },
      };
    } else {
      const workspace = await this.workspaceService.create(dto, userId, image);
      return {
        success: true,
        message: '워크스페이스 생성 성공.',
        data: { workspace: workspace },
      };
    }
  }

  @Get(':slug/members/me')
  async getMyMembership(@Req() req: Request, @Param('slug') slug: string) {
    const userId = req.user.sub;
    return this.workspaceService.getMyMembership(slug, userId);
  }

  @Get(':slug/stats')
  async getWorkspaceStats(@Req() req: Request, @Param('slug') slug: string) {
    const userId = req.user.sub;
    return await this.workspaceService.getWorkspaceStats(slug, userId);
  }

  @Get('/membinvite')
  async getInviteWorkspace(@Req() req: Request, @Query('code') code: string) {
    const email = req.user?.email;
    if (!email) {
      throw new UnauthorizedException('이메일 정보가 없습니다.');
    }

    if (!(code && code.length === 6)) {
      throw new BadRequestException('잘못된 요청입니다.');
    }

    return await this.workspaceService.getInviteWorkspace(email, code);
  }

  @Get('init/:slug')
  async workspaceInitBySlug(@Req() req: Request, @Param('slug') slug: string) {
    console.log('slug :', slug);
    const userId = req.user.sub;
    return await this.workspaceService.workspaceInitBySlug(slug, userId);
  }

  @Get(':slug')
  async workspaceBySlug(@Req() req: Request, @Param('slug') slug: string) {
    return await this.workspaceService.workspaceBySlug(slug);
  }

  @Post('invite')
  async inviteWorkspace(
    @Req() req: Request,
    @Body(ValidationPipe) dto: InviteWorkspaceDto,
  ) {
    const userId = req.user?.sub;
    return await this.workspaceService.inviteWorkspace(userId, dto);
  }

  @Post('invite/join')
  async joinWorkspaceByCode(@Req() req: Request, @Body('code') code: string) {
    const userId = req.user?.sub;
    const email = req.user?.email;
    if (!(userId && email)) {
      throw new UnauthorizedException('이용자 정보가 없습니다.');
    }

    return await this.workspaceService.joinWorkspaceByCode(userId, email, code);
  }

  @Get(':id/members')
  async getMembersById(@Param('id') id: string) {
    return await this.workspaceService.getMembersById(id);
  }
}
