import { ItemType } from "../types.js";

/** Display names used when building auction room labels for relisted items. */
export const ITEM_DISPLAY_NAMES: Record<ItemType, string> = {
  common_chest: "Common Chest",
  rare_chest: "Rare Chest",
  exotic_chest: "Exotic Chest",
  dagger: "The Poisoned Dagger",
  sigil: "The Sigil of the Iron Vault",
  painting: "The Masterpiece Painting",
  bleeding_coin: "The Bleeding Coin", // unreachable via relist -- kept for exhaustiveness
};
