// Core shared types for the game's economy and auction systems.
// Kept in one file for now since the project is small; can be split
// per-domain later if it grows.

export const DEBT_FLOOR = -1000;

export type ItemType =
  | "common_chest"
  | "rare_chest"
  | "exotic_chest"
  | "painting"
  | "sigil"
  | "dagger"
  | "bleeding_coin";

export const CHEST_ITEM_TYPES: ItemType[] = ["common_chest", "rare_chest", "exotic_chest"];

export interface DaggerMetadata {
  chargesRemaining: number; // starts at 2, decrements on use, never removed from inventory
}

export interface PaintingMetadata {
  lastCollected: number; // epoch ms; used for lazy income calculation
  displayed: boolean; // only displayed Paintings (max 2) accrue income
}

export interface BleedingCoinMetadata {
  lastDrained: number; // epoch ms; used for lazy drain calculation, same pattern as Painting
}

export type ItemMetadata =
  | DaggerMetadata
  | PaintingMetadata
  | BleedingCoinMetadata
  | Record<string, never>;

export interface InventoryItem {
  id: string;
  ownerId: string;
  itemType: ItemType;
  metadata: ItemMetadata;
  createdAt: number;
}

export interface Player {
  id: string;
  name: string;
  gold: number; // can go negative, floored at DEBT_FLOOR
  isAdmin: boolean;
}

export interface AttackLogEntry {
  id: string;
  victimId: string;
  attackerId: string | null; // null when attacker identity is protected
  amountStolen: number;
  blocked: boolean; // true if a Sigil deflected the attempt
  timestamp: number;
}

export interface DirectMessage {
  id: string;
  fromId: string;
  toId: string;
  body: string;
  timestamp: number;
}

/**
 * One player's participation in one auction room -- recorded at join time
 * and filled in when the room ends. Only PUBLIC-mode joins are recorded
 * (see AuctionManager.joinRoom): anonymous entry exists specifically to
 * keep a participation untraceable, including retrospectively via a
 * player's public profile, so it's never logged here.
 */
export interface AuctionHistoryEntry {
  id: string;
  playerId: string;
  roomId: string;
  tierLabel: string;
  itemLabel: string;
  entryFee: number;
  joinedAt: number;
  endedAt: number | null; // null while the room is still live
  won: boolean;
  finalPrice: number | null; // set once the room ends
}
