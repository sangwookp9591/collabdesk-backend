import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return `
    <title>CollabDesk Server</title>
    <h2>CollabDesk Server</h2>
    안녕하세요 Collab-Desk 서버입니다 
    <br/>
    <br/>
    자세한 API 호출 안내는 <a href="/api">/api</a>로 접속`;
  }
}
