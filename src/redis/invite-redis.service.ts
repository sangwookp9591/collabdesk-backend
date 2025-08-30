import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class InviteRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(InviteRedisService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
    });

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers() {
    // 메인 Redis 연결 이벤트

    this.redis.on('connect', () => {
      this.logger.log(`connected`);
    });

    this.redis.on('error', (error) => {
      this.logger.error(`connect failed ! :${error}`);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async setInviteCode(code: string, data: any, ttl: number = 604800) {
    await this.redis.setex(`invite:${code}`, ttl, JSON.stringify(data));
  }

  async getInviteCode(token: string) {
    const data = await this.redis.get(`invite:${token}`);
    return data ? JSON.parse(data) : null;
  }

  async removeInviteToken(token: string): Promise<void> {
    await this.redis.del(`invite:${token}`);
  }
}
