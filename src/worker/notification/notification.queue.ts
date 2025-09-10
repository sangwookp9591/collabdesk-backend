// notification.queue.ts
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationQueue {
  private readonly logger = new Logger(NotificationQueue.name);
  public queue: Queue;

  constructor(private readonly configService: ConfigService) {
    const redisOptions = this.getRedisConfig();
    const connection = new IORedis(redisOptions);

    this.queue = new Queue('notification', { connection });
    this.logger.log('NotificationQueue initialized');
  }

  async addJob(type: string, data: any) {
    await this.queue.add(type, data);
    this.logger.log(`Job added to queue: ${type}`);
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
