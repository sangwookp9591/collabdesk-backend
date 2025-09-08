import { Injectable, Logger } from '@nestjs/common';
import { RedisConnectionService } from './redis-connection.service';
import { ConfigService } from '@nestjs/config';

interface UserConnection {
  userId: string;
  socketId: string;
  workspaceId: string | null;
  joinedChannels: Set<string>;
  joinedDMConversations: Set<string>;
  lastActiveAt: Date;
  status: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB';
}

interface MessageCacheData {
  messageId: string;
  content: string;
  userId: string;
  channelId?: string;
  dmConversationId?: string;
  workspaceId?: string;
  createdAt: string;
  messageType: 'USER' | 'SYSTEM' | 'DM';
  mentions?: string[];
}

@Injectable()
export class MessageRedisService {
  private readonly logger = new Logger(MessageRedisService.name);
  // 이미 구독한 채널을 저장
  private subscribedChannels: Set<string> = new Set();

  // Redis Key 패턴 상수들
  private static readonly KEYS = {
    USER_CONNECTIONS: 'ws:connections',
    USER_CONNECTION: (userId: string) => `ws:user:${userId}`,
    WORKSPACE_USERS: (workspaceId: string) =>
      `ws:workspace:${workspaceId}:users`,
    WORKSPACE_USER_STATUS: (workspaceId: string) =>
      `ws:workspace:${workspaceId}:status`,
    CHANNEL_USERS: (channelId: string) => `ws:channel:${channelId}:users`,
    DM_USERS: (conversationId: string) => `ws:dm:${conversationId}:users`,

    // 메시지 캐싱
    RECENT_MESSAGES: (roomId: string) => `messages:recent:${roomId}`,
    MESSAGE_CACHE: (messageId: string) => `message:${messageId}`,

    // 읽지 않은 메시지
    UNREAD_CHANNELS: (userId: string) => `unread:channels:${userId}`,
    UNREAD_DMS: (userId: string) => `unread:dms:${userId}`,
    UNREAD_MENTIONS: (userId: string) => `unread:mentions:${userId}`,

    // 사용자 상태
    USER_STATUS: (userId: string) => `status:${userId}`,
    USER_LAST_SEEN: (userId: string) => `lastseen:${userId}`,
    USER_WORKSPACE_STATUS: (workspaceId: string, userId: string) =>
      `status:${workspaceId}:${userId}`,
    USER_WORKSPACE_LAST_SEEN: (workspaceId: string, userId: string) =>
      `lastseen:${workspaceId}:${userId}`,

    // 타이핑 상태
    TYPING_USERS: (roomType: 'channel' | 'dm', roomId: string) =>
      `typing:${roomType}:${roomId}`,

    // 서버 클러스터 관리
    SERVER_INSTANCE: (serverId: string) => `server:${serverId}`,
    ACTIVE_SERVERS: 'servers:active',
  } as const;

  constructor(
    private readonly redisConnection: RedisConnectionService,
    private readonly configService: ConfigService,
  ) {}

  async setUserConnection(
    userId: string,
    connection: UserConnection,
  ): Promise<void> {
    try {
      const connectionData = {
        ...connection,
        joinedChannels: Array.from(connection.joinedChannels),
        joinedDMConversations: Array.from(connection.joinedDMConversations),
        lastActiveAt: connection.lastActiveAt.toISOString(),
      };

      // 캐시데이터
      const pipeline = this.redisConnection.cache.pipeline();

      // 사용자별 연결 정보 저장
      pipeline.setex(
        MessageRedisService.KEYS.USER_CONNECTION(userId),
        this.getTTL('user_connection'),
        JSON.stringify(connectionData),
      );

      // 전체 연결된 사용자 집합에 추가
      pipeline.sadd(MessageRedisService.KEYS.USER_CONNECTIONS, userId);

      // 사용자 상태 업데이트
      pipeline.setex(
        MessageRedisService.KEYS.USER_STATUS(userId),
        this.getTTL('user_status'),
        connection.status,
      );

      // 마지막 접속 시간 업데이트
      pipeline.setex(
        MessageRedisService.KEYS.USER_LAST_SEEN(userId),
        this.getTTL('last_seen'),
        Date.now().toString(),
      );

      await pipeline.exec();
      this.logger.debug(`User connection set: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to set user connection: ${userId}`, error);
      throw error;
    }
  }

  async setWorkspaceUserStatus(
    userId: string,
    status: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB',
    workspaceId: string,
    customMessage?: string,
  ): Promise<void> {
    try {
      const statusData = {
        userId,
        status,
        customMessage: customMessage || null,
        lastActiveAt: new Date().toISOString(),
        timestamp: Date.now(),
      };

      const pipeline = this.redisConnection.cache.pipeline();

      // 사용자 상태 저장
      pipeline.setex(
        MessageRedisService.KEYS.USER_WORKSPACE_STATUS(workspaceId, userId),
        this.getTTL('user_status'),
        JSON.stringify(statusData),
      );

      // 마지막 활동 시간 업데이트
      pipeline.setex(
        MessageRedisService.KEYS.USER_WORKSPACE_LAST_SEEN(workspaceId, userId),
        this.getTTL('last_seen'),
        Date.now().toString(),
      );

      const statusKey =
        MessageRedisService.KEYS.WORKSPACE_USER_STATUS(workspaceId);
      // 온라인 사용자 집합 관리
      if (status === 'ONLINE') {
        pipeline.sadd(`${statusKey}:online`, userId);
        pipeline.expire(`${statusKey}:online`, this.getTTL('86400'));
        pipeline.srem(`${statusKey}:away`, userId);
        pipeline.srem(`${statusKey}:offline`, userId);
        pipeline.srem(`${statusKey}:dnd`, userId);
      } else if (status === 'AWAY') {
        pipeline.sadd(`${statusKey}:away`, userId);
        pipeline.expire(`${statusKey}:away`, this.getTTL('86400'));
        pipeline.srem(`${statusKey}:online`, userId);
        pipeline.srem(`${statusKey}:offline`, userId);
        pipeline.srem(`${statusKey}:dnd`, userId);
      } else if (status === 'DO_NOT_DISTURB') {
        pipeline.sadd(`${statusKey}:dnd`, userId);
        pipeline.expire(`${statusKey}:dnd`, this.getTTL('86400'));
        pipeline.srem(`${statusKey}:away`, userId);
        pipeline.srem(`${statusKey}:online`, userId);
        pipeline.srem(`${statusKey}:offline`, userId);
      } else if (status === 'OFFLINE') {
        pipeline.sadd(`${statusKey}:offline`, userId);
        pipeline.expire(`${statusKey}:offline`, this.getTTL('86400'));
        pipeline.srem(`${statusKey}:online`, userId);
        pipeline.srem(`${statusKey}:away`, userId);
        pipeline.srem(`${statusKey}:dnd`, userId);
      }

      await pipeline.exec();

      this.logger.debug(`User status updated: ${userId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to set user status: ${userId}`, error);
      throw error;
    }
  }

  async removeWorkspaceStatus(workspaceId: string, userId: string) {
    const pipeline = this.redisConnection.cache.pipeline();

    // 사용자 상태 삭제
    pipeline.del(
      MessageRedisService.KEYS.USER_WORKSPACE_STATUS(workspaceId, userId),
    );

    // 마지막 활동 시간 삭제
    pipeline.del(
      MessageRedisService.KEYS.USER_WORKSPACE_LAST_SEEN(workspaceId, userId),
    );

    const statusKey =
      MessageRedisService.KEYS.WORKSPACE_USER_STATUS(workspaceId);
    // 온라인 사용자 집합 식제
    pipeline.srem(`${statusKey}:online`, userId);
    pipeline.srem(`${statusKey}:away`, userId);
    pipeline.srem(`${statusKey}:offline`, userId);
    pipeline.srem(`${statusKey}:dnd`, userId);

    await pipeline.exec();
  }

  async getMultipleWorkspaceUserStatus(workspaceId: string): Promise<
    Record<
      string,
      {
        userId: string;
        status: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB';
        customMessage?: string;
        lastActiveAt: string;
      }
    >
  > {
    try {
      const userIds = await this.getWorkspaceUsers(workspaceId);
      if (userIds.length === 0) return {};

      const pipeline = this.redisConnection.cache.pipeline();
      userIds.forEach((userId) => {
        pipeline.get(
          MessageRedisService.KEYS.USER_WORKSPACE_STATUS(workspaceId, userId),
        );
      });

      const results = await pipeline.exec();
      const statusMap: Record<string, any> = {};

      userIds.forEach((userId, index) => {
        const result = results?.[index];
        if (result && result[1]) {
          try {
            const parsed = JSON.parse(result[1] as string);
            statusMap[userId] = {
              ...parsed,
              isOnline: parsed.status !== 'OFFLINE',
            };
          } catch {
            statusMap[userId] = {
              userId,
              status: 'OFFLINE',
              lastActiveAt: new Date().toISOString(),
            };
          }
        } else {
          statusMap[userId] = {
            userId,
            status: 'OFFLINE',
            lastActiveAt: new Date().toISOString(),
          };
        }
      });

      return statusMap;
    } catch (error) {
      this.logger.error('이용자 상태 조회 실패', error);
      return {};
    }
  }

  async getWorkspaceUsersByStatus(
    workspaceId: string,
    status: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB',
  ): Promise<string[]> {
    try {
      const statusKey =
        MessageRedisService.KEYS.WORKSPACE_USER_STATUS(workspaceId);
      let setKey: string;
      switch (status) {
        case 'ONLINE':
          setKey = ':online';
          break;
        case 'AWAY':
          setKey = ':away';
          break;
        case 'OFFLINE':
          setKey = ':offline';
          break;
        case 'DO_NOT_DISTURB':
          setKey = ':dnd';
          break;
      }

      return await this.redisConnection.cache.smembers(`${statusKey}${setKey}`);
    } catch (error) {
      this.logger.error(`Failed to get users by status: ${status}`, error);
      return [];
    }
  }

  async getWorkspaceUsersStatus(workspaceId: string): Promise<
    Record<
      string,
      {
        userId: string;
        status: 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB';
        customMessage?: string;
        lastActiveAt: string;
      }
    >
  > {
    const statusMap: Record<string, any> = {};
    try {
      const onlineUsers = await this.getWorkspaceUsersByStatus(
        workspaceId,
        'ONLINE',
      );
      const awayUsers = await this.getWorkspaceUsersByStatus(
        workspaceId,
        'AWAY',
      );
      const offlineUsers = await this.getWorkspaceUsersByStatus(
        workspaceId,
        'OFFLINE',
      );
      const dndUsers = await this.getWorkspaceUsersByStatus(
        workspaceId,
        'DO_NOT_DISTURB',
      );

      onlineUsers.forEach((oline) => {
        statusMap[oline] = 'ONLINE';
      });
      awayUsers.forEach((away) => {
        statusMap[away] = 'AWAY';
      });
      offlineUsers.forEach((offline) => {
        statusMap[offline] = 'OFFLINE';
      });
      dndUsers.forEach((dnd) => {
        statusMap[dnd] = 'DO_NOT_DISTURB';
      });
      return statusMap;
    } catch (error) {
      this.logger.error('Failed to get multiple user status', error);
      return {};
    }
  }

  async getUserConnection(userId: string): Promise<UserConnection | null> {
    try {
      const data = await this.redisConnection.cache.get(
        MessageRedisService.KEYS.USER_CONNECTION(userId),
      );

      if (!data) return null;

      const parsed = JSON.parse(data);
      return {
        ...parsed,
        joinedChannels: new Set(parsed.joinedChannels),
        joinedDMConversations: new Set(parsed.joinedDMConversations),
        lastActiveAt: new Date(parsed.lastActiveAt),
      };
    } catch (error) {
      this.logger.error(`Failed to get user connection: ${userId}`, error);
      return null;
    }
  }

  async removeUserConnection(userId: string): Promise<void> {
    try {
      const pipeline = this.redisConnection.cache.pipeline();

      // 사용자 연결 정보 삭제, 키 삭제
      pipeline.del(MessageRedisService.KEYS.USER_CONNECTION(userId));

      // 전체 연결 집합에서 제거 , 원소 제거, 해당 키안에 userId값만 제거
      pipeline.srem(MessageRedisService.KEYS.USER_CONNECTIONS, userId);

      // 상태를 OFFLINE으로 변경
      pipeline.setex(
        MessageRedisService.KEYS.USER_STATUS(userId),
        this.getTTL('user_status'),
        'OFFLINE',
      );

      await pipeline.exec();
      this.logger.debug(`User connection removed: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to remove user connection: ${userId}`, error);
      throw error;
    }
  }

  //워크스페이스/채널/DM 사용자 관리

  // 유저 워크스페이스에 추가
  async addUserToWorkspace(workspaceId: string, userId: string): Promise<void> {
    try {
      const key = MessageRedisService.KEYS.WORKSPACE_USERS(workspaceId);
      await this.redisConnection.cache.sadd(key, userId);
      //EXPIRE 는 TTL 설정이라 pipline으로 생성안해도된다.
      await this.redisConnection.cache.expire(
        key,
        this.getTTL('workspace_users'),
      );
      this.logger.debug(`User ${userId} added to workspace ${workspaceId}`);
    } catch (error) {
      this.logger.error(
        `Failed to add user to workspace: ${workspaceId}:${userId}`,
        error,
      );
      throw error;
    }
  }

  async removeUserFromWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.redisConnection.cache.srem(
        MessageRedisService.KEYS.WORKSPACE_USERS(workspaceId),
        userId,
      );
      this.logger.debug(`User ${userId} removed from workspace ${workspaceId}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove user from workspace: ${workspaceId}:${userId}`,
        error,
      );
      throw error;
    }
  }

  async getWorkspaceUsers(workspaceId: string): Promise<string[]> {
    try {
      return await this.redisConnection.cache.smembers(
        MessageRedisService.KEYS.WORKSPACE_USERS(workspaceId),
      );
    } catch (error) {
      this.logger.error(`Failed to get workspace users: ${workspaceId}`, error);
      return [];
    }
  }

  //채널 유저 추가

  async addUserToChannel(channelId: string, userId: string): Promise<void> {
    try {
      const key = MessageRedisService.KEYS.CHANNEL_USERS(channelId);
      await this.redisConnection.cache.sadd(key, userId);
      //EXPIRE 는 TTL 설정이라 pipline으로 생성안해도된다.
      await this.redisConnection.cache.expire(
        key,
        this.getTTL('channel_users'),
      );
      this.logger.debug(`User ${userId} added to channel ${channelId}`);
    } catch (error) {
      this.logger.error(
        `Failed to add user to channelId: ${channelId}:${userId}`,
        error,
      );
      throw error;
    }
  }

  async removeUserFromChannel(
    channelId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.redisConnection.cache.srem(
        MessageRedisService.KEYS.CHANNEL_USERS(channelId),
        userId,
      );
      this.logger.debug(
        `[SUCCESS][CACHE]  채널에서 유저 삭제 ${channelId}:${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `[FAIL][CACHE] 채널에서 유저 삭제 실패: ${channelId}:${userId}`,
        error,
      );
      throw error;
    }
  }

  async getChannelUsers(channelId: string): Promise<string[]> {
    try {
      return await this.redisConnection.cache.smembers(
        MessageRedisService.KEYS.CHANNEL_USERS(channelId),
      );
    } catch (error) {
      this.logger.error(
        `[FAIL][CACHE] 채널에서 유저 조회 실패: ${channelId}`,
        error,
      );
      return [];
    }
  }

  //디엠 대화방

  async addUserToDM(conversationId: string, userId: string): Promise<void> {
    try {
      const key = MessageRedisService.KEYS.DM_USERS(conversationId);
      await this.redisConnection.cache.sadd(key, userId);
      //EXPIRE 는 TTL 설정이라 pipline으로 생성안해도된다.
      await this.redisConnection.cache.expire(key, this.getTTL('dm_users'));
      this.logger.debug(`User ${userId} added to DM ${conversationId}`);
    } catch (error) {
      this.logger.error(
        `Failed to add user to DM: ${conversationId}:${userId}`,
        error,
      );
      throw error;
    }
  }

  async removeUserFromDM(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.redisConnection.cache.srem(
        MessageRedisService.KEYS.DM_USERS(conversationId),
        userId,
      );
      this.logger.debug(
        `[SUCCESS][CACHE] DM에서 유저 삭제 ${conversationId}:${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `[FAIL][CACHE] DM에서 유저 삭제 실패: ${conversationId}:${userId}`,
        error,
      );
      throw error;
    }
  }

  async getDMUsers(conversationId: string): Promise<string[]> {
    try {
      return await this.redisConnection.cache.smembers(
        MessageRedisService.KEYS.DM_USERS(conversationId),
      );
    } catch (error) {
      this.logger.error(
        `[FAIL][CACHE] DM에서 유저 조회 실패: ${conversationId}`,
        error,
      );
      return [];
    }
  }

  //타이핑
  async setTypingUser(
    userId: string,
    roomId: string,
    roomType: 'channel' | 'dm',
  ) {
    try {
      const key = MessageRedisService.KEYS.TYPING_USERS(roomType, roomId);
      await this.redisConnection.cache.sadd(key, userId);
      await this.redisConnection.cache.expire(key, this.getTTL('typing_users'));
    } catch (error) {
      this.logger.error(
        `[FAIL][CACHE] 타핑 설정 실패 ${roomType}: ${roomId}`,
        error,
      );
    }
  }

  async removeTypingUser(
    userId: string,
    roomId: string,
    roomType: 'channel' | 'dm',
  ) {
    try {
      const key = MessageRedisService.KEYS.TYPING_USERS(roomType, roomId);
      await this.redisConnection.cache.srem(key, userId);
    } catch (error) {
      this.logger.error(
        `[FAIL][CACHE] 타핑 삭제 실패: ${roomId}:${userId}`,
        error,
      );
    }
  }

  async getTypingUsers(roomId: string, roomType: 'channel' | 'dm') {
    try {
      const key = MessageRedisService.KEYS.TYPING_USERS(roomType, roomId);
      return await this.redisConnection.cache.smembers(key);
    } catch (error) {
      this.logger.error(
        `[FAIL][CACHE] 타핑 멤버 조회 실패:${roomType}:${roomId}`,
        error,
      );
    }
  }

  // 퍼블리셔
  async publishMessage(channel: string, message: any): Promise<void> {
    try {
      const messagePayload = {
        ...message,
        timestamp: Date.now(),
        serverId: this.getServerId(),
      };

      await this.redisConnection.publisher.publish(
        channel,
        JSON.stringify(messagePayload),
      );

      this.logger.debug(
        `[SUCCESS][MESSAGE][PUBLISH] 채널에 메시지 발송: ${channel}`,
      );
    } catch (error) {
      this.logger.error(
        `[FAILED][MESSAGE][PUBLISH] 채널에 메시지 발송: ${channel}`,
        error,
      );
      throw error;
    }
  }

  // 구독
  async subscribeToChannel(
    channel: string,
    callback: (message: any) => void,
  ): Promise<void> {
    if (this.subscribedChannels.has(channel)) {
      this.logger.warn(`[WARNING][MESSAGE][SUB] 이미 구독된 채널: ${channel}`);
      return;
    }

    try {
      this.subscribedChannels.add(channel);

      await this.redisConnection.subscriber.subscribe(channel);

      this.redisConnection.subscriber.on(
        'message',
        (receivedChannel, message) => {
          if (receivedChannel === channel) {
            try {
              const parsedMessage = JSON.parse(message);
              // 자신의 서버에서 발행한 메시지는 무시 (중복 방지)
              if (parsedMessage.serverId === this.getServerId()) {
                return;
              }
              callback(parsedMessage);
            } catch (error) {
              this.logger.error(
                `FAIL][SUB] 메시지 파싱 실패: ${channel}`,
                error,
              );
            }
          }
        },
      );

      this.logger.debug(`[SUCCESS][SUB] 채널 구독 성공: ${channel}`);
    } catch (error) {
      this.subscribedChannels.delete(channel);
      this.logger.error(`[FAIL][SUB] 채널 구독 실패: ${channel}`, error);
      throw error;
    }
  }

  async unsubscribeFromChannel(channel: string): Promise<void> {
    if (!this.subscribedChannels.has(channel)) {
      return;
    }

    try {
      await this.redisConnection.subscriber.unsubscribe(channel);
      this.subscribedChannels.delete(channel);
      this.logger.debug(`[SUCCESS][SUB] 채널 구독 해제 성공: ${channel}`);
    } catch (error) {
      this.logger.error(`[FAIL][SUB] 채널 구독 해제 실패: ${channel}`, error);
      throw error;
    }
  }

  // ========== 메시지 캐싱 ==========

  async cacheMessage(
    messageData: MessageCacheData,
    ttl?: number,
  ): Promise<void> {
    try {
      const cacheKey = MessageRedisService.KEYS.MESSAGE_CACHE(
        messageData.messageId,
      );
      const cacheTTL = ttl || this.getTTL('message_cache');

      await this.redisConnection.cache.setex(
        cacheKey,
        cacheTTL,
        JSON.stringify(messageData),
      );

      // 최근 메시지 리스트에도 추가
      const roomId = messageData.channelId || messageData.dmConversationId;
      if (roomId) {
        await this.addToRecentMessages(roomId, messageData);
      }

      this.logger.debug(`Message cached: ${messageData.messageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to cache message: ${messageData.messageId}`,
        error,
      );
      throw error;
    }
  }

  async getCachedMessage(messageId: string): Promise<MessageCacheData | null> {
    try {
      const data = await this.redisConnection.cache.get(
        MessageRedisService.KEYS.MESSAGE_CACHE(messageId),
      );
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get cached message: ${messageId}`, error);
      return null;
    }
  }

  private async addToRecentMessages(
    roomId: string,
    messageData: MessageCacheData,
  ): Promise<void> {
    const recentKey = MessageRedisService.KEYS.RECENT_MESSAGES(roomId);
    const maxRecentMessages = this.configService.get<number>(
      'REDIS_MAX_RECENT_MESSAGES',
      100,
    );

    const pipeline = this.redisConnection.cache.pipeline();
    pipeline.lpush(recentKey, JSON.stringify(messageData));
    pipeline.ltrim(recentKey, 0, maxRecentMessages - 1);
    pipeline.expire(recentKey, this.getTTL('recent_messages'));

    await pipeline.exec();
  }

  // ========== 읽지 않은 메시지 관리 ==========

  async incrementUnreadCount(
    userId: string,
    roomId: string,
    roomType: 'channel' | 'dm',
  ): Promise<void> {
    try {
      const key =
        roomType === 'channel'
          ? MessageRedisService.KEYS.UNREAD_CHANNELS(userId)
          : MessageRedisService.KEYS.UNREAD_DMS(userId);

      await this.redisConnection.cache.hincrby(key, roomId, 1);
      await this.redisConnection.cache.expire(key, this.getTTL('unread_count'));
    } catch (error) {
      this.logger.error(
        `Failed to increment unread count: ${userId}:${roomId}`,
        error,
      );
      throw error;
    }
  }

  async resetUnreadCount(
    userId: string,
    roomId: string,
    roomType: 'channel' | 'dm',
  ): Promise<void> {
    try {
      const key =
        roomType === 'channel'
          ? MessageRedisService.KEYS.UNREAD_CHANNELS(userId)
          : MessageRedisService.KEYS.UNREAD_DMS(userId);

      await this.redisConnection.cache.hdel(key, roomId);
    } catch (error) {
      this.logger.error(
        `Failed to reset unread count: ${userId}:${roomId}`,
        error,
      );
      throw error;
    }
  }

  async getUnreadCounts(userId: string): Promise<{
    channels: Record<string, number>;
    dms: Record<string, number>;
    mentions: number;
  }> {
    try {
      const [channelCounts, dmCounts, mentionCount] = await Promise.all([
        this.redisConnection.cache.hgetall(
          MessageRedisService.KEYS.UNREAD_CHANNELS(userId),
        ),
        this.redisConnection.cache.hgetall(
          MessageRedisService.KEYS.UNREAD_DMS(userId),
        ),
        this.redisConnection.cache.get(
          MessageRedisService.KEYS.UNREAD_MENTIONS(userId),
        ),
      ]);

      return {
        channels: this.parseCountObject(channelCounts),
        dms: this.parseCountObject(dmCounts),
        mentions: parseInt(mentionCount || '0', 10),
      };
    } catch (error) {
      this.logger.error(`Failed to get unread counts: ${userId}`, error);
      return { channels: {}, dms: {}, mentions: 0 };
    }
  }

  //유틸리티 메서드
  private getTTL(type: string): number {
    const ttlMap = {
      user_connection: 86400, // 24시간
      user_status: 86400, // 24시간
      last_seen: 604800, // 7일
      workspace_users: 86400, // 24시간
      channel_users: 86400, // 24시간
      dm_users: 86400, // 24시간
      message_cache: 3600, // 1시간
      typing_users: 10, // 20초
      recent_messages: 3600, // 1시간
      unread_count: 604800, // 7일
    };

    return ttlMap[type] || 3600;
  }

  private parseCountObject(
    obj: Record<string, string>,
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = parseInt(value, 10) || 0;
    }
    return result;
  }

  private getServerId(): string {
    return this.configService.get<string>('SERVER_ID') || 'default-server';
  }

  // 헬스 체크

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      publisher: boolean;
      subscriber: boolean;
      cache: boolean;
      subscribedChannels: number;
    };
  }> {
    try {
      const [pubHealth, subHealth, cacheHealth] = await Promise.all([
        this.redisConnection.publisher
          .ping()
          .then(() => true)
          .catch(() => false),
        this.redisConnection.subscriber
          .ping()
          .then(() => true)
          .catch(() => false),
        this.redisConnection.cache
          .ping()
          .then(() => true)
          .catch(() => false),
      ]);

      const allHealthy = pubHealth && subHealth && cacheHealth;

      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        details: {
          publisher: pubHealth,
          subscriber: subHealth,
          cache: cacheHealth,
          subscribedChannels: this.subscribedChannels.size,
        },
      };
    } catch (error) {
      this.logger.error('Health check failed', error);
      return {
        status: 'unhealthy',
        details: {
          publisher: false,
          subscriber: false,
          cache: false,
          subscribedChannels: 0,
        },
      };
    }
  }
}
