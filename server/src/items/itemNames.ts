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
