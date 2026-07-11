export type ItemType =
  | "common_chest"
  | "rare_chest"
  | "exotic_chest"
  | "painting"
  | "sigil"
  | "dagger"
  | "bleeding_coin";

export interface DaggerMetadata {
  chargesRemaining: number;
}

export interface PaintingMetadata {
  lastCollected: number;
  displayed: boolean;
}

export interface BleedingCoinMetadata {
  lastDrained: number;
}

export interface InventoryItem {
  id: string;
  ownerId: string;
  itemType: ItemType;
  metadata: DaggerMetadata | PaintingMetadata | BleedingCoinMetadata | Record<string, never>;
  createdAt: number;
}

export interface Player {
  id: string;
  name: string;
  gold: number;
  isAdmin: boolean;
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
  participants: { displayName: string }[];
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
