export type ItemType = "chest" | "painting" | "sigil" | "dagger" | "bleeding_coin";

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
}

export type AuctionPhase = "visible" | "flicker" | "ended";

export interface AuctionPublicState {
  active: boolean;
  id?: string;
  itemLabel?: string;
  phase?: AuctionPhase;
  currentPrice?: number;
  visiblePhaseEndsAt?: number | null;
  participants?: { displayName: string }[];
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
