import { Server as SocketIOServer } from "socket.io";
import { getPlayer } from "../db/store.js";

const RECENTLY_ONLINE_WINDOW_MS = 15 * 60 * 1000;

export interface PlayerActivityEntry {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: number;
}

/**
 * Tracks who's online and who was recently online, broadcasting changes
 * live to every connected client so the Player Activity sidebar updates
 * without polling.
 *
 * Online counts are refcounted rather than boolean, since a single player
 * can have multiple sockets open (e.g. two browser tabs) -- they only
 * flip to offline once every socket has disconnected.
 */
export class PresenceManager {
  private io: SocketIOServer;
  private onlineCounts: Map<string, number> = new Map();
  private lastSeenAt: Map<string, number> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  markConnected(playerId: string): void {
    const count = this.onlineCounts.get(playerId) ?? 0;
    this.onlineCounts.set(playerId, count + 1);
    this.lastSeenAt.set(playerId, Date.now());
    this.broadcast(playerId);
  }

  markDisconnected(playerId: string): void {
    const count = (this.onlineCounts.get(playerId) ?? 1) - 1;
    if (count <= 0) {
      this.onlineCounts.delete(playerId);
    } else {
      this.onlineCounts.set(playerId, count);
    }
    this.lastSeenAt.set(playerId, Date.now());
    this.broadcast(playerId);
  }

  isOnline(playerId: string): boolean {
    return (this.onlineCounts.get(playerId) ?? 0) > 0;
  }

  /** Players currently online, or seen within the last ~15 minutes -- online first, then most recent. */
  getActivityList(): PlayerActivityEntry[] {
    const now = Date.now();
    const entries: PlayerActivityEntry[] = [];

    for (const [playerId, seenAt] of this.lastSeenAt) {
      const player = getPlayer(playerId);
      if (!player) continue;

      const online = this.isOnline(playerId);
      if (!online && now - seenAt > RECENTLY_ONLINE_WINDOW_MS) continue;

      entries.push({ id: playerId, name: player.name, isOnline: online, lastSeenAt: seenAt });
    }

    entries.sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || b.lastSeenAt - a.lastSeenAt);
    return entries;
  }

  private broadcast(playerId: string): void {
    const player = getPlayer(playerId);
    if (!player) return;
    this.io.emit("presence:update", {
      id: playerId,
      name: player.name,
      isOnline: this.isOnline(playerId),
      lastSeenAt: this.lastSeenAt.get(playerId) ?? Date.now(),
    });
  }
}
