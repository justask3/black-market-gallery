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
  forged_seal: "The Forged Seal",
  vault_ledger_lock: "The Vault Ledger Lock",
  auction_insurance_token: "Auction Insurance Token",
  whispering_coin: "The Whispering Coin",
  tarnished_locket: "The Tarnished Locket",
  chalk_marker: "Chalk Marker",
  twin_faced_coin: "The Twin-Faced Coin",
  wardens_whistle: "The Warden's Whistle",
  phantom_bidder: "Phantom Bidder",
  street_rumor: "Street Rumor",
  dull_blade: "The Dull Blade",
  empty_frame: "The Empty Frame",
  bent_sigil: "The Bent Sigil",
  weighted_dice: "The Weighted Dice",
  gallery_deed: "The Gallery Deed",
  watchers_token: "The Watcher's Token",
  brokers_monopoly: "Broker's Monopoly",
  pickpockets_glove: "The Pickpocket's Glove",
  grudge_ledger: "The Grudge Ledger",
  oathbreakers_dagger: "The Oathbreaker's Dagger",
};

export type ItemRarity = "common" | "rare" | "legendary";

/**
 * Every item type's rarity category. Mirrors the same three loot-odds
 * bands used server-side in items/chest.ts (Common-band, Rare-band,
 * Legendary), extended to cover the original pre-existing items too:
 * Exotic Chest slots in as this game's "Legendary" tier (it's the top
 * chest rarity), and Bleeding Coin -- a cursed item with no normal
 * acquisition path -- is grouped with Legendary as the other
 * exceptional/dangerous item.
 */
export const ITEM_RARITY: Record<ItemType, ItemRarity> = {
  common_chest: "common",
  painting: "common",
  sigil: "common",
  dagger: "common",
  dull_blade: "common",
  pickpockets_glove: "common",
  bent_sigil: "common",
  twin_faced_coin: "common",
  weighted_dice: "common",
  tarnished_locket: "common",
  chalk_marker: "common",
  street_rumor: "common",
  empty_frame: "common",
  wardens_whistle: "common",

  rare_chest: "rare",
  forged_seal: "rare",
  vault_ledger_lock: "rare",
  whispering_coin: "rare",
  phantom_bidder: "rare",
  watchers_token: "rare",
  grudge_ledger: "rare",
  oathbreakers_dagger: "rare",
  auction_insurance_token: "rare",

  exotic_chest: "legendary",
  gallery_deed: "legendary",
  brokers_monopoly: "legendary",
  bleeding_coin: "legendary",
};

export const RARITY_LABELS: Record<ItemRarity, string> = {
  common: "Common",
  rare: "Rare",
  legendary: "Legendary",
};

/** One color per rarity tier -- matches the Common Block/Rare Vault/Exotic Showcase palette used in the Auction Room. */
export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: "bg-green-600 text-white",
  rare: "bg-blue-600 text-white",
  legendary: "bg-yellow-500 text-black",
};

export const RARITY_ORDER: ItemRarity[] = ["common", "rare", "legendary"];

/** Background/text classes for each item's block tile -- derived from its rarity, so every item in a tier shares one color. */
export const ITEM_BLOCK_COLORS: Record<ItemType, string> = Object.fromEntries(
  (Object.keys(ITEM_RARITY) as ItemType[]).map((itemType) => [itemType, RARITY_COLORS[ITEM_RARITY[itemType]]])
) as Record<ItemType, string>;
