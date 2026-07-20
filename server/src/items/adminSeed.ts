import { InventoryItem, ItemType } from "../types.js";
import { addItem } from "../db/store.js";
import { freshMetadataFor } from "./freshMetadata.js";

const ALL_ITEM_TYPES: ItemType[] = [
  "common_chest",
  "rare_chest",
  "exotic_chest",
  "painting",
  "sigil",
  "dagger",
  "forged_seal",
  "vault_ledger_lock",
  "auction_insurance_token",
  "whispering_coin",
  "tarnished_locket",
  "chalk_marker",
  "twin_faced_coin",
  "wardens_whistle",
  "phantom_bidder",
  "street_rumor",
  "dull_blade",
  "empty_frame",
  "bent_sigil",
  "weighted_dice",
  "gallery_deed",
  "watchers_token",
  "brokers_monopoly",
  "pickpockets_glove",
  "grudge_ledger",
  "oathbreakers_dagger",
];

/**
 * Grants one of every item type in the game. Metadata mirrors what
 * POST /items/:id/open produces for each type, so admin-held items
 * behave identically to normally-looted ones.
 */
export function seedAllItems(playerId: string): void {
  for (const itemType of ALL_ITEM_TYPES) {
    const item: InventoryItem = {
      id: crypto.randomUUID(),
      ownerId: playerId,
      itemType,
      metadata: freshMetadataFor(itemType),
      createdAt: Date.now(),
    };
    addItem(item);
  }
}
