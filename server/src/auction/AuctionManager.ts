import { Server as SocketIOServer } from "socket.io";
import { AuctionRoom, JoinMode } from "./AuctionRoom.js";
import { AUCTION_TIERS, AUCTION_TIER_ORDER, AuctionTierId } from "./tiers.js";
import { Player, InventoryItem, ItemType, ItemMetadata } from "../types.js";
import { canAfford, debit, credit } from "../economy/gold.js";
import {
  addItem,
  getPlayer,
  getInventory,
  removeItem,
  addAuctionHistoryEntry,
  settleAuctionHistoryForRoom,
} from "../db/store.js";
import { ITEM_DISPLAY_NAMES } from "../items/itemNames.js";
import { recordChalkMarkTransfer } from "../items/chalkMark.js";

export type EntryMode = JoinMode;

interface QueuedListing {
  startingPrice: number;
  listedByPlayerId: string;
  itemType: ItemType;
  metadata: ItemMetadata;
}

interface RoomItemOverride {
  itemLabel: string;
  itemType: ItemType;
  metadata: ItemMetadata;
  sellerId: string;
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
  participants: { playerId: string | null; displayName: string }[];
}

export interface AuctionTierSummary {
  tierId: AuctionTierId;
  tierLabel: string;
  liveCount: number;
  maxConcurrentRooms: number;
  /** Epoch ms of this tier's next scheduled spawn attempt, or null before bootstrap() runs. */
  nextSpawnAt: number | null;
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
  private nextSpawnAt: Map<AuctionTierId, number> = new Map();
  /** playerId -> roomId -> the amount they're currently the leading bidder for. See totalCommitted. */
  private commitments: Map<string, Map<string, number>> = new Map();

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

  /** Per-tier snapshot for the client's 3-column view: live count, cap, and next scheduled spawn. */
  getTierSummaries(): AuctionTierSummary[] {
    return AUCTION_TIER_ORDER.map((tierId) => {
      const tier = AUCTION_TIERS[tierId];
      return {
        tierId,
        tierLabel: tier.label,
        liveCount: this.activeCountFor(tierId),
        maxConcurrentRooms: tier.maxConcurrentRooms,
        nextSpawnAt: this.nextSpawnAt.get(tierId) ?? null,
      };
    });
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
   * Enqueues a player's relisted item (any type except Bleeding Coin,
   * enforced by the route calling this) into the Common Block queue.
   * Always succeeds -- capacity is enforced later, when the queue is
   * drained, not at enqueue time. Immediately attempts a fill in case a
   * Common slot is free right now, rather than making the player wait for
   * the next tick.
   */
  enqueueCommonListing(
    startingPrice: number,
    listedByPlayerId: string,
    itemType: ItemType,
    metadata: ItemMetadata
  ): { queued: true } {
    this.commonQueue.push({ startingPrice, listedByPlayerId, itemType, metadata });
    this.attemptFill("common");
    return { queued: true };
  }

  /**
   * Charges the entry fee (per the room's tier) and adds the player to it.
   * `mode: "phantom"` requires and consumes a Phantom Bidder item;
   * `useInsurance` (public joins only) requires and consumes an Auction
   * Insurance Token, charging a 50% premium on top of the entry fee.
   * Returns a result rather than throwing, so the socket handler can relay a
   * clean rejection reason to the client.
   */
  joinRoom(
    player: Player,
    roomId: string,
    mode: EntryMode,
    useInsurance: boolean = false
  ): { joined: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    const tierId = this.roomTier.get(roomId);
    if (!room || !tierId || room.phase === "ended") {
      return { joined: false, reason: "Room not found or auction already ended." };
    }
    // Already a participant -- idempotent no-op rather than charging the
    // entry fee again for a redundant join (e.g. a duplicate client event).
    if (room.participants.has(player.id)) {
      return { joined: true };
    }
    const tier = AUCTION_TIERS[tierId];
    const fee = mode === "public" ? tier.entryFeePublic : tier.entryFeeAnonymous;

    const inventory = getInventory(player.id);

    let phantomItem: InventoryItem | undefined;
    if (mode === "phantom") {
      phantomItem = inventory.find((i) => i.itemType === "phantom_bidder");
      if (!phantomItem) {
        return { joined: false, reason: "You don't have a Phantom Bidder to use." };
      }
    }

    let insuranceItem: InventoryItem | undefined;
    if (useInsurance) {
      if (mode !== "public") {
        return { joined: false, reason: "Auction Insurance only applies to public entries." };
      }
      insuranceItem = inventory.find((i) => i.itemType === "auction_insurance_token");
      if (!insuranceItem) {
        return { joined: false, reason: "You don't have an Auction Insurance Token to use." };
      }
    }

    const insurancePremium = useInsurance ? Math.ceil(tier.entryFeePublic * 0.5) : 0;
    const totalCost = fee + insurancePremium;
    if (!canAfford(player, totalCost)) {
      return { joined: false, reason: "Not enough gold to cover the entry fee." };
    }

    debit(player, totalCost);
    if (phantomItem) removeItem(player.id, phantomItem.id);
    if (insuranceItem) removeItem(player.id, insuranceItem.id);

    const { whisperRevealedTo } = room.addParticipant(player, mode);
    if (useInsurance) room.markInsured(player.id);

    // Whispering Coin: someone armed this room, and this join (anonymous
    // or phantom) just consumed it -- privately reveal this player's real
    // identity to whoever armed it.
    if (whisperRevealedTo) {
      this.io.to(`player:${whisperRevealedTo}`).emit("auction:whisperRevealed", {
        roomId,
        playerId: player.id,
        playerName: player.name,
      });
    }

    // Anonymous/phantom joins are now recorded too, just flagged -- the
    // profile route redacts everything except the date and auction type
    // for anyone but the player themselves, rather than omitting the
    // participation entirely.
    const auctionType = room.sellerId ? "Player's Auction" : tier.label;
    addAuctionHistoryEntry({
      id: crypto.randomUUID(),
      playerId: player.id,
      roomId: room.id,
      auctionType,
      itemLabel: room.itemLabel,
      entryFee: fee,
      joinedAt: Date.now(),
      endedAt: null,
      won: false,
      finalPrice: null,
      anonymous: mode !== "public",
    });
    return { joined: true };
  }

  /** Whispering Coin: arms the room the player is currently in, consuming the item. */
  useWhisperingCoin(player: Player, roomId: string, itemId: string): { used: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room || room.phase === "ended") {
      return { used: false, reason: "Room not found or auction already ended." };
    }
    if (!room.participants.has(player.id)) {
      return { used: false, reason: "You must be in this room to use that." };
    }
    const item = getInventory(player.id).find((i) => i.id === itemId && i.itemType === "whispering_coin");
    if (!item) {
      return { used: false, reason: "Whispering Coin not found in your inventory." };
    }
    removeItem(player.id, item.id);
    room.armWhisperingCoin(player.id);
    return { used: true };
  }

  /** Broker's Monopoly: bars one other current participant from further bids in this room, consuming the item. */
  useBrokersMonopoly(
    player: Player,
    roomId: string,
    itemId: string,
    targetPlayerId: string
  ): { used: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room || room.phase === "ended") {
      return { used: false, reason: "Room not found or auction already ended." };
    }
    if (!room.participants.has(player.id)) {
      return { used: false, reason: "You must be in this room to use that." };
    }
    if (targetPlayerId === player.id) {
      return { used: false, reason: "Cannot target yourself." };
    }
    const item = getInventory(player.id).find((i) => i.id === itemId && i.itemType === "brokers_monopoly");
    if (!item) {
      return { used: false, reason: "Broker's Monopoly not found in your inventory." };
    }
    const result = room.blockParticipant(targetPlayerId);
    if (!result.blocked) {
      return { used: false, reason: result.reason };
    }
    removeItem(player.id, item.id);
    this.io.to(roomId).emit("auction:state", room.getPublicState());
    return { used: true };
  }

  /**
   * Places a bid on behalf of a player, enforcing cross-room affordability:
   * since a bid only reserves gold once the room ends (see AuctionRoom),
   * a player leading bids in multiple concurrent rooms could otherwise
   * commit more gold than they have. This folds every OTHER room's
   * leading-bid exposure into the affordability check before delegating to
   * the room's own validation, and keeps the commitment ledger in sync
   * with who is actually leading each room afterward.
   */
  placeBid(player: Player, roomId: string, amount: number): { accepted: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { accepted: false, reason: "Room not found or auction already ended." };
    }

    const previousWinnerId = room.currentWinnerId;
    const reservedElsewhere = this.totalCommitted(player.id, roomId);
    const result = room.placeBid(player, amount, reservedElsewhere);
    if (!result.accepted) {
      return result;
    }

    if (previousWinnerId && previousWinnerId !== player.id) {
      this.clearCommitment(previousWinnerId, roomId);
    }
    this.setCommitment(player.id, roomId, amount);

    // Anti-snipe reset (Common Block) changed the countdown -- push the
    // updated state out so every connected client's timer re-syncs.
    if (result.timerExtended) {
      this.io.to(roomId).emit("auction:state", room.getPublicState());
      this.io.to(roomId).emit("auction:timerExtended", { roomId });
    }

    return result;
  }

  /** Sum of a player's leading-bid exposure across every room except `excludingRoomId`. */
  private totalCommitted(playerId: string, excludingRoomId: string): number {
    const perRoom = this.commitments.get(playerId);
    if (!perRoom) return 0;
    let total = 0;
    for (const [roomId, amount] of perRoom) {
      if (roomId !== excludingRoomId) total += amount;
    }
    return total;
  }

  private setCommitment(playerId: string, roomId: string, amount: number): void {
    let perRoom = this.commitments.get(playerId);
    if (!perRoom) {
      perRoom = new Map();
      this.commitments.set(playerId, perRoom);
    }
    perRoom.set(roomId, amount);
  }

  private clearCommitment(playerId: string, roomId: string): void {
    this.commitments.get(playerId)?.delete(roomId);
  }

  /**
   * Admin-only: shifts a live room's current-phase countdown by deltaMs.
   * Broadcasts the room's updated public state so connected clients' visible
   * countdown reflects the change immediately (a no-op for the flicker
   * phase, since its end time was never sent to clients to begin with).
   */
  adjustRoomTime(roomId: string, deltaMs: number): { adjusted: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { adjusted: false, reason: "Room not found or auction already ended." };
    }
    const result = room.adjustTime(deltaMs);
    if (result.adjusted) {
      this.io.to(roomId).emit("auction:state", room.getPublicState());
    }
    return result;
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
        const listedByPlayer = getPlayer(listing.listedByPlayerId);
        const itemDisplayName = ITEM_DISPLAY_NAMES[listing.itemType];
        const itemLabel = listedByPlayer
          ? `${itemDisplayName} — ${listedByPlayer.name}'s Auction`
          : itemDisplayName;
        this.spawnRoom(tierId, listing.startingPrice, {
          itemLabel,
          itemType: listing.itemType,
          metadata: listing.metadata,
          sellerId: listing.listedByPlayerId,
        });
      } else {
        this.spawnRoom(tierId, tier.startingPrice);
      }
    }
  }

  private spawnRoom(tierId: AuctionTierId, startingPrice: number, override?: RoomItemOverride): void {
    const tier = AUCTION_TIERS[tierId];
    const roomId = crypto.randomUUID();

    const room = new AuctionRoom({
      id: roomId,
      itemLabel: override?.itemLabel ?? tier.itemLabel,
      itemType: override?.itemType ?? tier.defaultItemType,
      itemMetadata: override?.metadata ?? {},
      sellerId: override?.sellerId ?? null,
      startingPrice,
      visibleDurationMs: tier.visibleDurationMs,
      hasFlicker: tier.hasFlicker,
      flickerMinMs: tier.flickerMinMs,
      flickerMaxMs: tier.flickerMaxMs,
      antiSnipeMs: tier.antiSnipeMs,
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
   * final price, drops the room's actual item (chest for server fillers, or
   * whatever a player relisted) into their inventory, pays the original
   * seller (if this was a relisted item, not a server-owned filler), then
   * frees the room's slot and immediately attempts to refill it --
   * independent of that tier's own periodic/scheduled tick.
   */
  private settleAuctionEnd(
    room: AuctionRoom,
    tierId: AuctionTierId,
    winnerId: string | null,
    finalPrice: number
  ): void {
    settleAuctionHistoryForRoom(room.id, winnerId, finalPrice);

    if (winnerId) {
      this.clearCommitment(winnerId, room.id);
      const winner = getPlayer(winnerId);
      if (winner) {
        room.settleWinner(winner);
        const awardedItem: InventoryItem = {
          id: crypto.randomUUID(),
          ownerId: winner.id,
          itemType: room.itemType,
          metadata: room.itemMetadata,
          createdAt: Date.now(),
        };
        addItem(awardedItem);

        // Chalk-marked items carry their history in metadata, which
        // already passed through unchanged above -- just append the
        // winner as its new owner.
        if (awardedItem.metadata.chalkMark) {
          recordChalkMarkTransfer(awardedItem.metadata.chalkMark, winner);
        }

        // Server-owned filler rooms have no seller -- the winning bid is
        // just the cost of participating, same as before. A relisted
        // item's seller is paid the winning bid, same as any real auction.
        if (room.sellerId) {
          const seller = getPlayer(room.sellerId);
          if (seller) credit(seller, finalPrice);
        }
      }
    }

    // Auction Insurance Token: refund insured players who were leading and
    // got outbid within the late window, as long as they didn't go on to
    // win anyway. Insurance only ever applies to public entries, so the
    // refund is always half of that tier's public entry fee.
    const tier = AUCTION_TIERS[tierId];
    for (const playerId of room.lateOutbidPlayerIds) {
      if (playerId === winnerId) continue;
      if (!room.insuredPlayerIds.has(playerId)) continue;
      const insuredPlayer = getPlayer(playerId);
      if (!insuredPlayer) continue;
      credit(insuredPlayer, Math.ceil(tier.entryFeePublic * 0.5));
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
      this.nextSpawnAt.set(tierId, Date.now() + cadence.intervalMs);
      setInterval(() => {
        this.attemptFill(tierId);
        this.nextSpawnAt.set(tierId, Date.now() + cadence.intervalMs);
      }, cadence.intervalMs);
      return;
    }

    if (cadence.type === "randomInterval") {
      const scheduleNext = () => {
        const delay = cadence.minMs + Math.random() * (cadence.maxMs - cadence.minMs);
        this.nextSpawnAt.set(tierId, Date.now() + delay);
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
      this.nextSpawnAt.set(tierId, Date.now() + delay);
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
