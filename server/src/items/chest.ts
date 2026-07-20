import { ItemType, ChestTier, ChestLootResult } from "../types.js";

const COMMON_BAND: ItemType[] = [
  "dull_blade",
  "pickpockets_glove",
  "bent_sigil",
  "twin_faced_coin",
  "weighted_dice",
  "tarnished_locket",
  "chalk_marker",
  "street_rumor",
  "empty_frame",
  "wardens_whistle",
];

const RARE_BAND: ItemType[] = [
  "forged_seal",
  "vault_ledger_lock",
  "whispering_coin",
  "phantom_bidder",
  "watchers_token",
  "grudge_ledger",
  "oathbreakers_dagger",
  "auction_insurance_token",
];

const LEGENDARY_BAND: ItemType[] = ["gallery_deed", "brokers_monopoly"];

type WeightedEntry =
  | { weight: number; kind: "gold"; min: number; max: number }
  | { weight: number; kind: "item"; itemType: ItemType };

function evenlySplit(band: ItemType[], totalWeight: number): WeightedEntry[] {
  const perItem = totalWeight / band.length;
  return band.map((itemType) => ({ weight: perItem, kind: "item" as const, itemType }));
}

/**
 * Weighted-pool loot tables per chest rarity. Replaces the old fixed
 * gold/painting/sigil/dagger chance bands now that there are ~20 more
 * possible item outcomes -- a flat list of weighted entries scales to any
 * number of outcomes without nested if/else chains. Rarity is strictly
 * gated and cumulative by tier: Common Chest only ever offers Common-band
 * items, Rare Chest offers Common+Rare, and Exotic Chest -- the only tier
 * that can drop a Legendary -- offers all three.
 */
const LOOT_TABLES: Record<ChestTier, WeightedEntry[]> = {
  common: [
    { weight: 50, kind: "gold", min: 100, max: 4000 },
    { weight: 10, kind: "item", itemType: "painting" },
    { weight: 5, kind: "item", itemType: "sigil" },
    { weight: 5, kind: "item", itemType: "dagger" },
    ...evenlySplit(COMMON_BAND, 30),
  ],
  rare: [
    { weight: 30, kind: "gold", min: 500, max: 8000 },
    { weight: 15, kind: "item", itemType: "painting" },
    { weight: 8, kind: "item", itemType: "sigil" },
    { weight: 7, kind: "item", itemType: "dagger" },
    ...evenlySplit(COMMON_BAND, 25),
    ...evenlySplit(RARE_BAND, 15),
  ],
  exotic: [
    { weight: 15, kind: "gold", min: 2000, max: 20000 },
    { weight: 18, kind: "item", itemType: "painting" },
    { weight: 10, kind: "item", itemType: "sigil" },
    { weight: 12, kind: "item", itemType: "dagger" },
    ...evenlySplit(COMMON_BAND, 20),
    ...evenlySplit(RARE_BAND, 20),
    ...evenlySplit(LEGENDARY_BAND, 5),
  ],
};

/** Rolls a chest's loot table for the given rarity tier. Pure function, easy to test independently of the inventory/economy layers that consume its result. */
export function rollChestLoot(tier: ChestTier): ChestLootResult {
  const table = LOOT_TABLES[tier];
  const totalWeight = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of table) {
    if (roll < entry.weight) {
      if (entry.kind === "gold") {
        const amount = Math.floor(entry.min + Math.random() * (entry.max - entry.min + 1));
        return { type: "gold", amount };
      }
      return { type: "item", itemType: entry.itemType };
    }
    roll -= entry.weight;
  }

  // Unreachable in practice (floating point rounding safety net only).
  return { type: "gold", amount: table[0].kind === "gold" ? table[0].min : 100 };
}

/** Maps a chest's ItemType to the loot-table tier it should roll against. */
export function chestTierFor(itemType: ItemType): ChestTier {
  switch (itemType) {
    case "common_chest":
      return "common";
    case "rare_chest":
      return "rare";
    case "exotic_chest":
      return "exotic";
    default:
      throw new Error(`Not a chest item type: ${itemType}`);
  }
}

/** Broad category used by Street Rumor to describe a locked-in result without revealing the exact item. */
export function categoryFor(result: ChestLootResult): string {
  if (result.type === "gold") return "Gold";

  const categories: Partial<Record<ItemType, string>> = {
    dagger: "Weapon",
    dull_blade: "Weapon",
    pickpockets_glove: "Weapon",
    oathbreakers_dagger: "Weapon",
    sigil: "Defense",
    forged_seal: "Defense",
    bent_sigil: "Defense",
    vault_ledger_lock: "Defense",
    wardens_whistle: "Defense",
    painting: "Passive Income",
    tarnished_locket: "Passive Income",
    empty_frame: "Passive Income",
    twin_faced_coin: "Gamble",
    weighted_dice: "Gamble",
    chalk_marker: "Utility",
    street_rumor: "Utility",
    whispering_coin: "Utility",
    phantom_bidder: "Utility",
    watchers_token: "Utility",
    auction_insurance_token: "Utility",
    grudge_ledger: "Utility",
    gallery_deed: "Legendary",
    brokers_monopoly: "Legendary",
  };

  return categories[result.itemType] ?? "Curio";
}
