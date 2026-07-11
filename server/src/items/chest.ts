import { ItemType } from "../types.js";

export type ChestTier = "common" | "rare" | "exotic";

export type ChestLootResult =
  | { type: "gold"; amount: number }
  | { type: "item"; itemType: Extract<ItemType, "painting" | "sigil" | "dagger"> };

interface ChestLootTable {
  goldChance: number;
  goldMin: number;
  goldMax: number;
  paintingChance: number;
  sigilChance: number;
  // Remainder (1 - goldChance - paintingChance - sigilChance) goes to dagger.
}

/**
 * Loot tables per chest rarity. Odds and gold ranges escalate with rarity:
 * a Rare/Exotic Chest trades away some of the (very common) gold outcome
 * for a much better shot at painting/sigil/dagger, and a wider gold range
 * when gold does hit.
 */
const LOOT_TABLES: Record<ChestTier, ChestLootTable> = {
  common: { goldChance: 0.7, goldMin: 100, goldMax: 4000, paintingChance: 0.2, sigilChance: 0.05 },
  rare: { goldChance: 0.5, goldMin: 500, goldMax: 8000, paintingChance: 0.3, sigilChance: 0.1 },
  exotic: { goldChance: 0.3, goldMin: 2000, goldMax: 20000, paintingChance: 0.35, sigilChance: 0.15 },
};

/**
 * Rolls a chest's loot table for the given rarity tier. Pure function:
 * takes no dependencies, easy to unit test independently of the
 * inventory/economy layers that consume its result.
 */
export function rollChestLoot(tier: ChestTier): ChestLootResult {
  const table = LOOT_TABLES[tier];
  const roll = Math.random(); // [0, 1)

  if (roll < table.goldChance) {
    const amount = Math.floor(table.goldMin + Math.random() * (table.goldMax - table.goldMin + 1));
    return { type: "gold", amount };
  }
  if (roll < table.goldChance + table.paintingChance) {
    return { type: "item", itemType: "painting" };
  }
  if (roll < table.goldChance + table.paintingChance + table.sigilChance) {
    return { type: "item", itemType: "sigil" };
  }
  return { type: "item", itemType: "dagger" };
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
