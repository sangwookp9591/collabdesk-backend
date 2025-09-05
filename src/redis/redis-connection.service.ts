import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name);

  private _publisher: Redis;
  private _subscriber: Redis;
  private _cache: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeConnections();
  }

  async onModuleDestroy() {
    await this.closeConnections();
  }

  private async initializeConnections() {
    const redisConfig = this.getRedisConfig();

    try {
      // Publisher 연결 (메시지 발행용)
      this._publisher = new Redis({
        ...redisConfig,
        lazyConnect: true,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      });

      // Subscriber 연결 (메시지 구독용)
      this._subscriber = new Redis({
        ...redisConfig,
        lazyConnect: true,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      });

      // Cache 연결 (일반 캐시 작업용)
      this._cache = new Redis({
        ...redisConfig,
        lazyConnect: true,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
      });

      await Promise.all([
        this._publisher.connect(),
        this._subscriber.connect(),
        this._cache.connect(),
      ]);

      this.setupEventHandlers();
      this.logger.log('Redis 연결 초기화 성공');
    } catch (error) {
      this.logger.error('Redis 연결 초기화 실패', error);
      throw error;
    }
  }

  private getRedisConfig(): RedisOptions {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      return {
        host: this.extractHostFromUrl(redisUrl),
        port: this.extractPortFromUrl(redisUrl),
        password: this.extractPasswordFromUrl(redisUrl),
        // db: this.configService.get<number>('REDIS_DB', 0),
      };
    }

    return {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    };
  }

  private setupEventHandlers() {
    const connections = [
      { name: 'Publisher', client: this._publisher },
      { name: 'Subscriber', client: this._subscriber },
      { name: 'Cache', client: this._cache },
    ];

    connections.forEach(({ name, client }) => {
      client.on('connect', () => {
        this.logger.log(`Redis ${name} connected`);
      });

      client.on('ready', () => {
        this.logger.log(`Redis ${name} ready`);
      });

      client.on('error', (error) => {
        this.logger.error(`Redis ${name} error:`, error);
      });

      client.on('close', () => {
        this.logger.warn(`Redis ${name} connection closed`);
      });

      client.on('reconnecting', () => {
        this.logger.log(`Redis ${name} reconnecting...`);
      });
    });
  }

  private async closeConnections() {
    try {
      await Promise.all([
        this._publisher?.quit(),
        this._subscriber?.quit(),
        this._cache?.quit(),
      ]);
      this.logger.log('All Redis connections closed');
    } catch (error) {
      this.logger.error('Error closing Redis connections', error);
    }
  }

  // URL 파싱 헬퍼 메서드들
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

  // Getters
  get publisher(): Redis {
    if (!this._publisher) {
      throw new Error('Redis publisher not initialized');
    }
    return this._publisher;
  }

  get subscriber(): Redis {
    if (!this._subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
    return this._subscriber;
  }

  get cache(): Redis {
    if (!this._cache) {
      throw new Error('Redis cache not initialized');
    }
    return this._cache;
  }

  // 헬스 체크
  async isHealthy(): Promise<boolean> {
    try {
      await Promise.all([
        this._publisher.ping(),
        this._subscriber.ping(),
        this._cache.ping(),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
