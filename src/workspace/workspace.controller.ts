import {
  BadRequestException,
  Body,
  Controller,
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

@UseGuards(JwtAuthGuard)
@Controller('workspace')
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
}
