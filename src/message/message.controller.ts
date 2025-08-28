import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/jwt-token/guards/jwt-auth.guard';
import { MessageService } from './message.service';
import { GetMessagesQueryDto } from './dto/get-message-by-channel';

@Controller('message')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('channel/:slug')
  async getMessagesByChannel(
    @Param('slug') slug: string,
    @Query() dto: GetMessagesQueryDto,
  ) {
    return await this.messageService.getMessagesByChannel(slug, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.messageService.remove(id);
  }
}
