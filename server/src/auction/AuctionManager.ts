import { Server as SocketIOServer } from "socket.io";
import { AuctionRoom } from "./AuctionRoom.js";
import { AUCTION_TIERS, AUCTION_TIER_ORDER, AuctionTierId } from "./tiers.js";
import { Player, InventoryItem } from "../types.js";
import { canAfford, debit } from "../economy/gold.js";
import { addItem, getPlayer } from "../db/store.js";

export type EntryMode = "public" | "anonymous";

interface QueuedListing {
  startingPrice: number;
  listedByPlayerId: string;
}

export interface AuctionRoomSummary {
  tierId: AuctionTierId;
  tierLabel: string;
  entryFeePublic: number;
  entryFeeAnonymous: number;
  id: string;
  itemLabel: string;
  phase: string;
  currentPrice: number;
  visiblePhaseEndsAt: number | null;
  participants: { displayName: string }[];
}

/**
 * Manages every live auction room across all three tiers (Common Block,
 * Rare Vault, Exotic Showcase). The server is the primary driver of supply:
 * each tier runs its own spawn scheduler (see startScheduler) that keeps its
 * room count topped up to its cap, independent of player activity. Common
 * Block additionally drains a FIFO queue of player-submitted relists before
 * falling back to a server-owned filler room -- Rare Vault and Exotic
 * Showcase are always server-curated (see tiers.ts's playerFeedable flag).
 */
export class AuctionManager {
  private io: SocketIOServer;
  private rooms: Map<string, AuctionRoom> = new Map();
  private roomTier: Map<string, AuctionTierId> = new Map();
  private commonQueue: QueuedListing[] = [];

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  /** Starts every tier's spawn scheduler, plus an immediate fill for Common and Rare. */
  bootstrap(): void {
    for (const tierId of AUCTION_TIER_ORDER) {
      this.startScheduler(tierId);
    }
    // Exotic deliberately does NOT get an immediate boot-fill: it only ever
    // spawns at its two fixed daily clock times. An unconditional boot-fill
    // would spawn a bonus Exotic room on every dev restart (tsx watch),
    // violating "exactly twice a day."
    this.attemptFill("common");
    this.attemptFill("rare");
  }

  getRoom(roomId: string): AuctionRoom | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): AuctionRoomSummary[] {
    const summaries: AuctionRoomSummary[] = [];
    for (const tierId of AUCTION_TIER_ORDER) {
      const tier = AUCTION_TIERS[tierId];
      for (const [roomId, room] of this.rooms) {
        if (this.roomTier.get(roomId) !== tierId) continue;
        summaries.push({
          tierId,
          tierLabel: tier.label,
          entryFeePublic: tier.entryFeePublic,
          entryFeeAnonymous: tier.entryFeeAnonymous,
          ...room.getPublicState(),
        });
      }
    }
    return summaries;
  }

  /**
   * Finds a room where both given players are participants -- used by the
   * Dagger flow to determine whether an attack happens "in the same room"
   * for anonymity purposes, now that multiple rooms can be live at once.
   */
  findSharedRoom(playerAId: string, playerBId: string): AuctionRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.participants.has(playerAId) && room.participants.has(playerBId)) {
        return room;
      }
    }
    return undefined;
  }

  /**
   * Enqueues a player's relisted Chest into the Common Block queue. Always
   * succeeds -- capacity is enforced later, when the queue is drained, not
   * at enqueue time. Immediately attempts a fill in case a Common slot is
   * free right now, rather than making the player wait for the next tick.
   */
  enqueueCommonListing(startingPrice: number, listedByPlayerId: string): { queued: true } {
    this.commonQueue.push({ startingPrice, listedByPlayerId });
    this.attemptFill("common");
    return { queued: true };
  }

  /**
   * Charges the entry fee (per the room's tier) and adds the player to it.
   * Returns a result rather than throwing, so the socket handler can relay a
   * clean rejection reason to the client.
   */
  joinRoom(player: Player, roomId: string, mode: EntryMode): { joined: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    const tierId = this.roomTier.get(roomId);
    if (!room || !tierId || room.phase === "ended") {
      return { joined: false, reason: "Room not found or auction already ended." };
    }
    const tier = AUCTION_TIERS[tierId];
    const fee = mode === "anonymous" ? tier.entryFeeAnonymous : tier.entryFeePublic;
    if (!canAfford(player, fee)) {
      return { joined: false, reason: "Not enough gold to cover the entry fee." };
    }
    debit(player, fee);
    room.addParticipant(player, mode === "anonymous");
    return { joined: true };
  }

  private activeCountFor(tierId: AuctionTierId): number {
    let count = 0;
    for (const t of this.roomTier.values()) {
      if (t === tierId) count++;
    }
    return count;
  }

  /**
   * Tops up a tier up to its capacity: for Common Block, drains the player
   * listing queue first, falling back to a server-owned filler room only
   * once the queue is empty. Rare Vault and Exotic Showcase always spawn
   * server-owned fillers, since they're never player-fed.
   *
   * Shared code path used by scheduled ticks, bootstrap(), and the
   * refill-on-end callback below -- capacity logic lives in exactly one
   * place.
   */
  private attemptFill(tierId: AuctionTierId): void {
    const tier = AUCTION_TIERS[tierId];
    while (this.activeCountFor(tierId) < tier.maxConcurrentRooms) {
      if (tier.playerFeedable && this.commonQueue.length > 0) {
        const listing = this.commonQueue.shift()!;
        this.spawnRoom(tierId, listing.startingPrice);
      } else {
        this.spawnRoom(tierId, tier.startingPrice);
      }
    }
  }

  private spawnRoom(tierId: AuctionTierId, startingPrice: number): void {
    const tier = AUCTION_TIERS[tierId];
    const roomId = crypto.randomUUID();

    const room = new AuctionRoom({
      id: roomId,
      itemLabel: tier.itemLabel,
      startingPrice,
      visibleDurationMs: tier.visibleDurationMs,
      flickerMinMs: tier.flickerMinMs,
      flickerMaxMs: tier.flickerMaxMs,
      onPhaseChange: (phase) => {
        this.io.to(roomId).emit("auction:phaseChanged", { roomId, phase });
      },
      onEnded: (winnerId, finalPrice) => {
        this.settleAuctionEnd(room, tierId, winnerId, finalPrice);
      },
    });

    this.rooms.set(roomId, room);
    this.roomTier.set(roomId, tierId);
    room.start();
  }

  /**
   * Called once when a room's timer fires "ended". Charges the winner the
   * final price, drops an unopened Chest into their inventory, then frees
   * the room's slot and immediately attempts to refill it -- independent of
   * that tier's own periodic/scheduled tick.
   */
  private settleAuctionEnd(
    room: AuctionRoom,
    tierId: AuctionTierId,
    winnerId: string | null,
    finalPrice: number
  ): void {
    if (winnerId) {
      const winner = getPlayer(winnerId);
      if (winner) {
        room.settleWinner(winner);
        const chest: InventoryItem = {
          id: crypto.randomUUID(),
          ownerId: winner.id,
          itemType: "chest",
          metadata: {},
          createdAt: Date.now(),
        };
        addItem(chest);
      }
    }

    this.io.to(room.id).emit("auction:ended", { roomId: room.id, winnerId, finalPrice });

    this.rooms.delete(room.id);
    this.roomTier.delete(room.id);
    this.attemptFill(tierId);
  }

  /** Starts the given tier's recurring spawn schedule, per its configured cadence. */
  private startScheduler(tierId: AuctionTierId): void {
    const tier = AUCTION_TIERS[tierId];
    const cadence = tier.cadence;

    if (cadence.type === "interval") {
      setInterval(() => this.attemptFill(tierId), cadence.intervalMs);
      return;
    }

    if (cadence.type === "randomInterval") {
      const scheduleNext = () => {
        const delay = cadence.minMs + Math.random() * (cadence.maxMs - cadence.minMs);
        setTimeout(() => {
          this.attemptFill(tierId);
          scheduleNext();
        }, delay);
      };
      scheduleNext();
      return;
    }

    // dailyTimes
    const scheduleNext = () => {
      const delay = msUntilNextDailyOccurrence(cadence.hours);
      setTimeout(() => {
        this.attemptFill(tierId);
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }
}

/**
 * Computes the delay, in ms, until the next occurrence of any of the given
 * server-local hours (e.g. [12, 20]), rolling over to tomorrow if every
 * slot for today has already passed. No catch-up logic: if the server is
 * down through a scheduled time, that occurrence is simply skipped.
 */
function msUntilNextDailyOccurrence(hours: number[]): number {
  const now = new Date();
  const candidates = hours.map((hour) => {
    const candidate = new Date(now);
    candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  });
  return Math.min(...candidates) - now.getTime();
}
