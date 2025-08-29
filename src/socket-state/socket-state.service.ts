import { Injectable } from '@nestjs/common';

export interface UserConnection {
  userId: string;
  socketId: string;
  currentWorkspace: string | null;
  joinedChannels: Set<string>;
  lastActiveAt: Date;
}

@Injectable()
export class SocketStateService {
  private userConnections = new Map<string, UserConnection>();
  private workspaceUsers = new Map<string, Set<string>>();
  private channelUsers = new Map<string, Set<string>>();

  setUserConnection(userId: string, connection: UserConnection) {
    this.userConnections.set(userId, connection);
  }

  getUserConnection(userId: string) {
    return this.userConnections.get(userId);
  }

  removeUserConnection(userId: string) {
    const conn = this.userConnections.get(userId);
    if (!conn) return;

    // 채널에서 제거
    conn.joinedChannels.forEach((channelId) => {
      this.channelUsers.get(channelId)?.delete(userId);
    });

    // 워크스페이스에서 제거
    if (conn.currentWorkspace) {
      this.workspaceUsers.get(conn.currentWorkspace)?.delete(userId);
    }

    this.userConnections.delete(userId);
  }

  joinWorkspace(userId: string, workspaceId: string) {
    const conn = this.userConnections.get(userId);
    if (!conn) return;

    // 이전 워크스페이스 제거
    if (conn.currentWorkspace) {
      this.workspaceUsers.get(conn.currentWorkspace)?.delete(userId);
    }

    // 새 워크스페이스 추가
    if (!this.workspaceUsers.has(workspaceId)) {
      this.workspaceUsers.set(workspaceId, new Set());
    }
    this.workspaceUsers.get(workspaceId)?.add(userId);
    conn.currentWorkspace = workspaceId;
  }

  joinChannel(userId: string, channelId: string) {
    if (!this.channelUsers.has(channelId)) {
      this.channelUsers.set(channelId, new Set());
    }
    this.channelUsers.get(channelId)?.add(userId);

    const conn = this.userConnections.get(userId);
    if (conn) {
      conn.joinedChannels.add(channelId);
    }
  }

  getWorkspaceUsers(workspaceId: string) {
    return this.workspaceUsers.get(workspaceId) || new Set();
  }

  getChannelUsers(channelId: string) {
    return this.channelUsers.get(channelId) || new Set();
  }
}
