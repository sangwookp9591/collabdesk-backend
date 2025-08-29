import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

interface UserConnection {
  userId: string;
  socketId: string;
  currentWorkspace: string | null;
  joinedChannels: Set<string>;
  lastActiveAt: Date;
}

@Injectable()
export class MessageRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(MessageRedisService.name);
  private readonly pub: Redis;
  private readonly sub: Redis;

  private static readonly USER_CONNECTIONS = 'user_connections';
  private static readonly WORKSPACE_USERS = (id: string) =>
    `workspace:${id}:users`;
  private static readonly CHANNEL_USERS = (id: string) => `channel:${id}:users`;
  private static readonly RECENT_MESSAGES = (id: string) =>
    `recent_messages:${id}`;

  // 이미 구독한 채널을 저장
  private subscribedChannels: Set<string> = new Set();

  constructor() {
    this.pub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
    });

    this.sub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
    });
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers() {
    // 메인 Redis 연결 이벤트
    [this.pub, this.sub].forEach((client, idx) => {
      client.on('connect', () => {
        this.logger.log(`${idx === 0 ? 'Publisher' : 'Subscriber'} connected`);
      });
      client.on('error', (err) => {
        this.logger.error(
          `${idx === 0 ? 'Publisher' : 'Subscriber'} error`,
          err,
        );
      });
    });
  }

  async onModuleDestroy() {
    await this.pub.quit();
    await this.sub.quit();
  }

  async setUserConnection(
    userId: string,
    connection: UserConnection,
  ): Promise<void> {
    await this.pub.hset(
      MessageRedisService.USER_CONNECTIONS,
      userId,
      JSON.stringify(connection),
    );
    // 24시간 후 자동 삭제

    await this.setExpire(
      `${MessageRedisService.USER_CONNECTIONS}:${userId}`,
      86400,
    );
  }

  async getUserConnection(userId: string): Promise<UserConnection | null> {
    const data = await this.pub.hget('user_connections', userId);
    return data ? JSON.parse(data) : null;
  }

  async removeUserConnection(userId: string): Promise<void> {
    await this.pub.hdel('user_connections', userId);
  }

  // 워크스페이스 온라인 사용자 관리 (원자적 연산)
  async addUserToWorkspace(workspaceId: string, userId: string): Promise<void> {
    await this.pub.sadd(
      MessageRedisService.WORKSPACE_USERS(workspaceId),
      userId,
    );
    await this.setExpire(
      MessageRedisService.WORKSPACE_USERS(workspaceId),
      86400,
    );
  }

  async removeUserFromWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await this.pub.srem(
      MessageRedisService.WORKSPACE_USERS(workspaceId),
      userId,
    );
  }

  async getWorkspaceUsers(workspaceId: string): Promise<string[]> {
    return this.pub.smembers(MessageRedisService.WORKSPACE_USERS(workspaceId));
  }

  // 채널 온라인 사용자 관리 (원자적 연산)
  async addUserToChannel(channelId: string, userId: string): Promise<void> {
    await this.pub.sadd(MessageRedisService.CHANNEL_USERS(channelId), userId);
    await this.setExpire(MessageRedisService.CHANNEL_USERS(channelId), 86400);
  }

  async removeUserFromChannel(
    channelId: string,
    userId: string,
  ): Promise<void> {
    await this.pub.srem(MessageRedisService.CHANNEL_USERS(channelId), userId);
  }

  async getChannelUsers(channelId: string): Promise<string[]> {
    return this.pub.smembers(MessageRedisService.CHANNEL_USERS(channelId));
  }

  // 사용자가 참여한 모든 채널에서 제거 (연결 해제 시)
  async removeUserFromAllChannels(
    userId: string,
    channelIds: string[],
  ): Promise<void> {
    const pipeline = this.pub.pipeline();
    channelIds.forEach((id) =>
      pipeline.srem(MessageRedisService.CHANNEL_USERS(id), userId),
    );
    await pipeline.exec();
  }

  // 실시간 메시지 임시 저장 (WebSocket 재연결용)
  async cacheRecentMessage<T>(
    channelId: string,
    message: T,
    ttl = 3600,
  ): Promise<void> {
    const key = MessageRedisService.RECENT_MESSAGES(channelId);
    await this.pub.lpush(key, JSON.stringify(message));
    await this.pub.ltrim(key, 0, 99); // 최근 100개만 보관
    await this.setExpire(key, ttl);
  }

  async getRecentMessages<T>(channelId: string, count = 50): Promise<T[]> {
    const messages = await this.pub.lrange(
      MessageRedisService.RECENT_MESSAGES(channelId),
      0,
      count - 1,
    );
    return messages.map((msg) => JSON.parse(msg)).reverse();
  }

  private async setExpire(key: string, ttl: number) {
    await this.pub.expire(key, ttl);
  }

  // -----------------------
  // Pub/Sub 기능
  // -----------------------
  async publish(channelKey: string, message: any) {
    await this.pub.publish(channelKey, JSON.stringify(message));
  }

  subscribeChannel(channelKey: string, gatewayCallback: (msg: any) => void) {
    if (this.subscribedChannels.has(channelKey)) {
      this.logger.log(
        `이미 해당 서버에는 구독된 Redis Key입니다. ${channelKey}`,
      );
      return;
    }

    this.subscribedChannels.add(channelKey);

    this.sub
      .subscribe(channelKey)
      .catch((err) =>
        this.logger.error(
          `Redis 구독 [KEY] : ${channelKey} , [ERROR] : ${err}`,
        ),
      );

    this.sub.on('message', (chan, message) => {
      if (chan === channelKey) {
        // 같은 채널 key이면 메세지전달
        gatewayCallback(JSON.parse(message));
      }
    });
  }
}
