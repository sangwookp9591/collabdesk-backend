import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorker.name);
  private notificationQueue: Queue;
  private worker: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.log('NotificationWorker started');

    // Redis connection options
    const redisOptions = this.getRedisConfig();

    // Queue 생성 (Publisher 역할)
    this.notificationQueue = new Queue('notification', {
      connection: new IORedis(redisOptions),
    });

    await this.notificationQueue.waitUntilReady();

    // Worker 생성 (Subscriber 역할)
    this.worker = new Worker(
      'notification',
      async (job: Job) => this.handleWorkspaceNotification(job),
      { connection: new IORedis(redisOptions) },
    );

    await this.worker.waitUntilReady();
    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('NotificationWorker initialized');
  }

  async addJob(type: string, data: any) {
    await this.notificationQueue.add(type, data);
  }

  private async handleWorkspaceNotification(job: Job) {
    const message = job.data;
    const workspaceId = message?.workspaceId;
    const userIds = message?.userIds ?? [];

    if (!workspaceId || userIds.length === 0) return;

    const tx = userIds.map((userId: string) => {
      const data = message.data;
      if (data.type === 'MENTION' || data.type === 'NEW_MESSAGE') {
        if (data.roomType === 'channel') {
          return this.prisma.notification.create({
            data: {
              type: message.type,
              userId,
              workspaceId,
              channelId: data.roomId,
              messageId: data.messageId,
            },
          });
        } else {
          return this.prisma.notification.create({
            data: {
              type: message.type,
              userId,
              workspaceId,
              dmConversationId: data.roomId,
              messageId: data.messageId,
            },
          });
        }
      }
    });

    await this.prisma.$transaction(tx);
  }

  private getRedisConfig() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      return {
        host: this.extractHostFromUrl(redisUrl),
        port: this.extractPortFromUrl(redisUrl),
        password: this.extractPasswordFromUrl(redisUrl),
      };
    }
    return {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    };
  }

  private extractHostFromUrl(url: string): string {
    const match = url.match(/redis:\/\/(?:.*@)?([^:]+)/);
    return match ? match[1] : 'localhost';
  }

  private extractPortFromUrl(url: string): number {
    const match = url.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : 6379;
  }

  private extractPasswordFromUrl(url: string): string | undefined {
    const match = url.match(/redis:\/\/(?:.*:(.*)@)?/);
    return match ? match[1] : undefined;
  }
}
