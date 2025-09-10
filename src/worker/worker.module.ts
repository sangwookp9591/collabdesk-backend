import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { NotificationWorker } from './notification/notification.worker';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [NotificationWorker],
  exports: [NotificationWorker],
})
export class WorkerModule {}
