import { ItemType } from "./types";

/** Display names shown in the Inventory screen. Mirrors server/src/items/itemNames.ts. */
export const ITEM_DISPLAY_NAMES: Record<ItemType, string> = {
  common_chest: "Common Chest",
  rare_chest: "Rare Chest",
  exotic_chest: "Exotic Chest",
  dagger: "The Poisoned Dagger",
  sigil: "The Sigil of the Iron Vault",
  painting: "The Masterpiece Painting",
  bleeding_coin: "The Bleeding Coin",
};

/** Background/text classes for each item's block tile in the Inventory grid. */
export const ITEM_BLOCK_COLORS: Record<ItemType, string> = {
  common_chest: "bg-green-600 text-white",
  rare_chest: "bg-blue-600 text-white",
  exotic_chest: "bg-purple-600 text-white",
  painting: "bg-amber-500 text-white",
  sigil: "bg-indigo-600 text-white",
  dagger: "bg-red-700 text-white",
  bleeding_coin: "bg-gray-900 text-red-400",
};
