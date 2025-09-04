import {
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
  Body,
  Logger,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request, Response } from 'express';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  private readonly logger = new Logger(UserController.name);
  constructor(private readonly userService: UserService) {}

  @Get()
  async findOne(@Req() req: Request) {
    const userId = req.user?.sub;

    this.logger.debug('user findOne : ', userId);
    if (!userId) {
      return {
        success: false,
        message: '세션 정보 없음.',
        data: { lastActiveWorkspaceId: null },
      };
    }

    const user = await this.userService.findOne(userId);
    return {
      success: true,
      message: '유저조회 성공',
      data: { user: user },
    };
  }

  @Get('workspaces')
  async userWorkspaces(@Req() req: Request) {
    const userId = req.user?.sub;
    this.logger.debug('user userWorkspaces : ', userId);
    if (!userId) {
      return {
        success: false,
        message: '세션 정보 없음.',
        data: { lastActiveWorkspaceId: null },
      };
    }

    const workspaces = await this.userService.userWorkspaces(userId);
    return {
      success: true,
      message: '워크스페이스 목록 조회 성공',
      data: { workspaces: workspaces },
    };
  }

  @Get('lastworkspace')
  async lastWorkspace(@Req() req: Request) {
    const userId = req.user?.sub;
    this.logger.debug('user Get lastWorkspace : ', userId);
    if (!userId) {
      return {
        success: false,
        message: '세션 정보 없음.',
        data: { lastActiveWorkspaceId: null },
      };
    }
    const lastWorkSpace = await this.userService.lastWorkspace(userId);

    this.logger.debug('user Get lastWorkspace Result: ', lastWorkSpace);
    return {
      success: true,
      message: '마지막 워크스페이스 조회 성공',
      data: lastWorkSpace,
    };
  }

  @Patch('lastworkspace')
  async updateLastWorkspaceId(
    @Req() req: Request,
    @Body()
    body: {
      workspaceId: string;
    },
  ) {
    const userId = req.user?.sub;
    const workspaceId = body.workspaceId;

    this.logger.debug('user Patch lastWorkspace : ', userId);
    return await this.userService.updateLastWorkspaceId(userId, workspaceId);
  }
}
