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
    this.logger.debug('job ,message : ', message);

    const workspaceId = message?.workspaceId;
    const messageId = message?.messageId;
    const userIds = message?.userIds ?? [];
    const data = message?.data;
    const type = message?.type;
    const roomId = message?.roomId;
    const roomType = message?.roomType;

    if (!workspaceId || userIds.length === 0 || !data) return;

    // 조건에 맞는 프라미스만 배열에 담기
    const tx = userIds.flatMap((userId: string) => {
      if (type === 'MENTION' || type === 'NEW_MESSAGE') {
        if (roomType === 'channel') {
          return this.prisma.notification.create({
            data: {
              type: type,
              userId,
              workspaceId,
              data: data,
              channelId: roomId,
              messageId: messageId,
            },
          });
        } else {
          return this.prisma.notification.create({
            data: {
              type: type,
              userId,
              workspaceId,
              data: data,
              dmConversationId: roomId,
              messageId: messageId,
            },
          });
        }
      }
      return []; // 조건 안 맞으면 빈 배열 반환
    });

    if (tx.length > 0) {
      await this.prisma.$transaction(tx);
    }
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
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
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
