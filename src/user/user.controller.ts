import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import type { Request, Response } from 'express';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async findOne(@Req() req: Request) {
    const userId = req.user?.sub;

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

  @Get('workspace')
  async userWorkspace(@Req() req: Request) {
    const userId = req.user?.sub;

    if (!userId) {
      return {
        success: false,
        message: '세션 정보 없음.',
        data: { lastActiveWorkspaceId: null },
      };
    }

    const workspaces = await this.userService.userWorkspace(userId);
    return {
      success: true,
      message: '워크스페이스 목록 조회 성공',
      data: { workspaces: workspaces },
    };
  }

  @Get('lastworkspace')
  async lastWorkspace(@Req() req: Request) {
    const userId = req.user?.sub;

    if (!userId) {
      return {
        success: false,
        message: '세션 정보 없음.',
        data: { lastActiveWorkspaceId: null },
      };
    }
    const lastWorkSpace = await this.userService.lastWorkspace(userId);
    return {
      success: true,
      message: '마지막 워크스페이스 조회 성공',
      data: lastWorkSpace,
    };
  }
}
