import { NestFactory } from '@nestjs/core';
import { NotificationWorker } from './notification/notification.worker';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(WorkerModule);
  const worker = appContext.get(NotificationWorker);
  await worker.onModuleInit(); // Worker 초기화
}

bootstrap();
