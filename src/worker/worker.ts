import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { NotificationWorker } from './notification/notification.worker';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const worker = appContext.get(NotificationWorker);
  await worker.onModuleInit(); // Worker 초기화
}

bootstrap();
