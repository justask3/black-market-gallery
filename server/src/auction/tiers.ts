export type AuctionTierId = "common" | "rare" | "exotic";

export type SpawnCadence =
  | { type: "interval"; intervalMs: number }
  | { type: "randomInterval"; minMs: number; maxMs: number }
  | { type: "dailyTimes"; hours: number[] }; // 24h server-local hours, e.g. [12, 20]

export interface AuctionTierConfig {
  id: AuctionTierId;
  label: string;
  itemLabel: string;
  maxConcurrentRooms: number;
  visibleDurationMs: number;
  flickerMinMs: number;
  flickerMaxMs: number;
  startingPrice: number;
  entryFeePublic: number;
  entryFeeAnonymous: number;
  cadence: SpawnCadence;
  /** True only for "common" -- gates whether the player relist queue feeds this tier. */
  playerFeedable: boolean;
}

const SHARED_FLICKER_MIN_MS = 15 * 1000; // not specified per-tier; reused everywhere

export const AUCTION_TIERS: Record<AuctionTierId, AuctionTierConfig> = {
  common: {
    id: "common",
    label: "Common Block",
    itemLabel: "Mysterious Chest",
    maxConcurrentRooms: 2,
    visibleDurationMs: 4 * 60 * 1000,
    flickerMinMs: SHARED_FLICKER_MIN_MS,
    flickerMaxMs: 60 * 1000,
    startingPrice: 100,
    entryFeePublic: 500,
    entryFeeAnonymous: 1500,
    cadence: { type: "interval", intervalMs: 10 * 60 * 1000 },
    playerFeedable: true,
  },
  rare: {
    id: "rare",
    label: "Rare Vault",
    itemLabel: "Mysterious Chest",
    maxConcurrentRooms: 1,
    visibleDurationMs: 12 * 60 * 1000,
    flickerMinMs: SHARED_FLICKER_MIN_MS,
    flickerMaxMs: 3 * 60 * 1000,
    startingPrice: 1000,
    entryFeePublic: 2000,
    entryFeeAnonymous: 5000,
    cadence: { type: "randomInterval", minMs: 60 * 60 * 1000, maxMs: 2 * 60 * 60 * 1000 },
    playerFeedable: false,
  },
  exotic: {
    id: "exotic",
    label: "Exotic Showcase",
    itemLabel: "Mysterious Chest",
    maxConcurrentRooms: 1,
    visibleDurationMs: 25 * 60 * 1000,
    flickerMinMs: SHARED_FLICKER_MIN_MS,
    flickerMaxMs: 5 * 60 * 1000,
    startingPrice: 10000,
    entryFeePublic: 10000,
    entryFeeAnonymous: 25000,
    cadence: { type: "dailyTimes", hours: [12, 20] },
    playerFeedable: false,
  },
};

export const AUCTION_TIER_ORDER: AuctionTierId[] = ["common", "rare", "exotic"];

/**
 * Explicit global cap, kept separate from the sum of per-tier caps (currently
 * 2+1+1=4) so it stays meaningful if individual tier caps are tuned later
 * without silently changing the launch-scale room budget.
 */
export const MAX_CONCURRENT_ROOMS_GLOBAL = 4;
