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

/** Weapon-family items (Dagger and its variants) all use this same shape. */
export interface WeaponMetadata {
  chargesRemaining: number;
}

export interface PaintingMetadata {
  lastCollected: number;
  displayed: boolean;
}

export interface BleedingCoinMetadata {
  lastDrained: number;
}

export interface VaultLedgerLockMetadata {
  lastUpkeepAt: number;
}

export interface TarnishedLocketMetadata {
  lastCollected: number;
}

export interface EmptyFrameMetadata {
  displayed: boolean;
}

export interface WatchersTokenMetadata {
  visits: { viewerId: string; viewerName: string; timestamp: number }[];
}

export type ChestLootResult = { type: "gold"; amount: number } | { type: "item"; itemType: ItemType };

export interface ChestMetadata {
  pendingLoot?: ChestLootResult;
}

/** Attached to any item that's been marked with a Chalk Marker -- survives resale. */
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
  gold: number;
  isAdmin: boolean;
  paintingDisplayCap?: number;
}

export type AuctionPhase = "visible" | "flicker" | "ended";

export type AuctionTierId = "common" | "rare" | "exotic";

export interface AuctionRoomSummary {
  tierId: AuctionTierId;
  tierLabel: string;
  entryFeePublic: number;
  entryFeeAnonymous: number;
  id: string;
  itemLabel: string;
  phase: AuctionPhase;
  currentPrice: number;
  visiblePhaseEndsAt: number | null;
  participants: { playerId: string | null; displayName: string }[];
}

export interface AuctionTierSummary {
  tierId: AuctionTierId;
  tierLabel: string;
  liveCount: number;
  maxConcurrentRooms: number;
  nextSpawnAt: number | null;
}

export interface CatalogItem {
  itemType: string;
  name: string;
  description: string;
}

export interface AttackLogEntry {
  id: string;
  victimId: string;
  attackerId: string | null;
  amountStolen: number;
  blocked: boolean;
  timestamp: number;
}

export interface PlayerActivityEntry {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: number;
}

export interface DirectMessage {
  id: string;
  fromId: string;
  toId: string;
  body: string;
  timestamp: number;
}

export interface AuctionHistoryEntry {
  roomId: string;
  auctionType: string;
  joinedAt: number;
  anonymous: boolean;
  // Redacted to null for anonymous entries when viewing someone else's profile.
  itemLabel: string | null;
  entryFee: number | null;
  endedAt: number | null;
  won: boolean | null;
  finalPrice: number | null;
}

export interface PublicProfile {
  playerId: string;
  playerName: string;
  estimatedGold: number;
  history: AuctionHistoryEntry[];
}
