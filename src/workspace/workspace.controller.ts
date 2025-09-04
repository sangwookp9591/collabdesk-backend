import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';

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

    return await this.workspaceService.create(dto, userId, image);
  }

  @Get()
  async getUserWorkspaces(@Req() req: Request) {
    const userId = req.user.sub;
    return this.workspaceService.getUserWorkspaces(userId);
  }

  @UseGuards(WorkspaceMemberGuard)
  @Get(':slug/members')
  async getWorkspaceMembers(@Req() req: Request, @Param('slug') slug: string) {
    return this.workspaceService.getWorkspaceMembers(slug);
  }

  @UseGuards(WorkspaceMemberGuard)
  @Get(':slug/members/me')
  async getMyMembership(@Req() req: Request, @Param('slug') slug: string) {
    const userId = req.user.sub;
    return this.workspaceService.getMyMembership(slug, userId);
  }

  @UseGuards(WorkspaceMemberGuard)
  @Get(':slug/members/:memberId')
  async getWorkspaceMemberById(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Param('slug') memberId: string,
  ) {
    return this.workspaceService.getWorkspaceMemberById(slug, memberId);
  }

  @UseGuards(WorkspaceMemberGuard)
  @Get(':slug/stats')
  async getWorkspaceStats(@Req() req: Request, @Param('slug') slug: string) {
    const userId = req.user.sub;
    return await this.workspaceService.getWorkspaceStats(slug, userId);
  }

  @UseGuards(WorkspaceMemberGuard)
  @Get(':slug/init')
  async workspaceInitBySlug(@Req() req: Request, @Param('slug') slug: string) {
    console.log('slug :', slug);
    const userId = req.user.sub;
    return await this.workspaceService.workspaceInitBySlug(slug, userId);
  }

  @UseGuards(WorkspaceMemberGuard)
  @Get(':slug')
  async workspaceBySlug(@Req() req: Request, @Param('slug') slug: string) {
    return await this.workspaceService.workspaceBySlug(slug);
  }

  @Get(':id/members')
  async getMembersById(@Param('id') id: string) {
    return await this.workspaceService.getMembersById(id);
  }
}
