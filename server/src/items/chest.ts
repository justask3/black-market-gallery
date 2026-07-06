import { ItemType } from "../types.js";

export type ChestLootResult =
  | { type: "gold"; amount: number }
  | { type: "item"; itemType: Extract<ItemType, "painting" | "sigil" | "dagger"> };

/**
 * Rolls the Chest's loot table:
 *   70% -> gold, uniform random integer in [100, 4000]
 *   20% -> Masterpiece Painting
 *   5%  -> Sigil of the Iron Vault
 *   5%  -> Poisoned Dagger
 *
 * Pure function: takes no dependencies, easy to unit test independently
 * of the inventory/economy layers that consume its result.
 */
export function rollChestLoot(): ChestLootResult {
  const roll = Math.random(); // [0, 1)

  if (roll < 0.7) {
    const amount = Math.floor(100 + Math.random() * (4000 - 100 + 1));
    return { type: "gold", amount };
  }
  if (roll < 0.9) {
    // 0.7 - 0.9 => 20%
    return { type: "item", itemType: "painting" };
  }
  if (roll < 0.95) {
    // 0.9 - 0.95 => 5%
    return { type: "item", itemType: "sigil" };
  }
  // 0.95 - 1.0 => 5%
  return { type: "item", itemType: "dagger" };
}
