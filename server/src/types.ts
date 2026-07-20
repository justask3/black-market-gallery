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
  | "bleeding_coin"
  | "forged_seal"
  | "vault_ledger_lock"
  | "auction_insurance_token"
  | "whispering_coin"
  | "tarnished_locket"
  | "chalk_marker"
  | "twin_faced_coin"
  | "wardens_whistle"
  | "phantom_bidder"
  | "street_rumor"
  | "dull_blade"
  | "empty_frame"
  | "bent_sigil"
  | "weighted_dice"
  | "gallery_deed"
  | "watchers_token"
  | "brokers_monopoly"
  | "pickpockets_glove"
  | "grudge_ledger"
  | "oathbreakers_dagger";

export const CHEST_ITEM_TYPES: ItemType[] = ["common_chest", "rare_chest", "exotic_chest"];

/** Weapon-family items (dagger and its variants) all use this same shape -- see items/weapon.ts. */
export interface WeaponMetadata {
  chargesRemaining: number;
}

export interface PaintingMetadata {
  lastCollected: number; // epoch ms; used for lazy income calculation
  displayed: boolean; // only displayed Paintings (up to a player's cap) accrue income
}

export interface BleedingCoinMetadata {
  lastDrained: number; // epoch ms; used for lazy drain calculation, same pattern as Painting
}

export interface VaultLedgerLockMetadata {
  lastUpkeepAt: number; // epoch ms; lazy upkeep-cost tick, same pattern as Painting/BleedingCoin
}

export interface TarnishedLocketMetadata {
  lastCollected: number; // epoch ms; lazy income tick, same pattern as Painting but no display concept
}

export interface EmptyFrameMetadata {
  displayed: boolean; // occupies a display slot like a Painting, but never accrues income
}

export interface WatchersTokenMetadata {
  visits: { viewerId: string; viewerName: string; timestamp: number }[];
}

export type ChestTier = "common" | "rare" | "exotic";

export type ChestLootResult =
  | { type: "gold"; amount: number }
  | { type: "item"; itemType: ItemType };

export interface ChestMetadata {
  /** Set by Street Rumor: the chest's contents, rolled and locked in ahead of opening. */
  pendingLoot?: ChestLootResult;
}

/** Attached (via intersection, see ItemMetadata below) to any item that's been marked with a Chalk Marker -- survives resale since metadata passes through relist/settlement unchanged. */
export interface ChalkMarkInfo {
  history: { ownerId: string; ownerName: string; acquiredAt: number }[];
}

export type ItemMetadata = (
  | WeaponMetadata
  | PaintingMetadata
  | BleedingCoinMetadata
  | VaultLedgerLockMetadata
  | TarnishedLocketMetadata
  | EmptyFrameMetadata
  | WatchersTokenMetadata
  | ChestMetadata
  | Record<string, never>
) & { chalkMark?: ChalkMarkInfo };

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
  /** Set by consuming a Gallery Deed. Undefined means the default (MAX_DISPLAYED_PAINTINGS). */
  paintingDisplayCap?: number;
}

export interface AttackLogEntry {
  id: string;
  victimId: string;
  attackerId: string | null; // null when attacker identity is protected
  amountStolen: number;
  blocked: boolean; // true if a Sigil (or variant) deflected the attempt
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
 * (both public and anonymous) and filled in when the room ends. The
 * `anonymous` flag is what the public profile route uses to redact
 * everything except the date and auction type for anyone other than the
 * player themselves -- entering anonymously hides the outcome, not the
 * fact that a participation happened.
 */
export interface AuctionHistoryEntry {
  id: string;
  playerId: string;
  roomId: string;
  /** "Common Block" | "Rare Vault" | "Exotic Showcase" | "Player's Auction" (relisted item, regardless of which tier slot it ran in). */
  auctionType: string;
  itemLabel: string;
  entryFee: number;
  joinedAt: number;
  endedAt: number | null; // null while the room is still live
  won: boolean;
  finalPrice: number | null; // set once the room ends
  anonymous: boolean;
}
