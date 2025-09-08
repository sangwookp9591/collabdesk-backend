import { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  data: {
    user: {
      userId: string;
      email: string;
      iat?: number;
      exp?: number;
    };
    rooms: Set<string>;
  };
}

export interface UserConnection {
  userId: string;
  socketId: string;
  workspaceId: string | null;
  joinedChannels: Set<string>;
  joinedDMConversations: Set<string>;
  lastActiveAt: Date;
  status: UserStatus;
}

export type UserStatus = 'ONLINE' | 'AWAY' | 'OFFLINE' | 'DO_NOT_DISTURB';

export interface SocketEvent<T = any> {
  event: string;
  data: T;
  timestamp: number;
  userId: string;
  workspaceId?: string;
}

export interface JoinRoomPayload {
  roomId: string;
  roomType: 'channel' | 'dm' | 'workspace';
  workspaceId?: string;
}

export interface MessagePayload {
  content: string;
  roomId: string;
  roomType: 'channel' | 'dm';
  workspaceId: string;
  parentId?: string;
  mentions?: string[];
}

export interface TypingPayload {
  roomId: string;
  roomType: 'channel' | 'dm';
}

export interface ReactionPayload {
  messageId: string;
  emoji: string;
  action: 'add' | 'remove';
}
