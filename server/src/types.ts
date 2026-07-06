// Core shared types for the game's economy and auction systems.
// Kept in one file for now since the project is small; can be split
// per-domain later if it grows.

export const DEBT_FLOOR = -1000;

export type ItemType = "chest" | "painting" | "sigil" | "dagger" | "bleeding_coin";

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
}

export interface AttackLogEntry {
  id: string;
  victimId: string;
  attackerId: string | null; // null when attacker identity is protected
  amountStolen: number;
  blocked: boolean; // true if a Sigil deflected the attempt
  timestamp: number;
}
