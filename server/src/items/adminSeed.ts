import { InventoryItem, ItemType, DaggerMetadata, PaintingMetadata } from "../types.js";
import { addItem } from "../db/store.js";

const ALL_ITEM_TYPES: ItemType[] = [
  "common_chest",
  "rare_chest",
  "exotic_chest",
  "painting",
  "sigil",
  "dagger",
];

/**
 * Grants one of every item type in the game. Metadata mirrors what
 * POST /items/:id/open produces for each type, so admin-held items
 * behave identically to normally-looted ones.
 */
export function seedAllItems(playerId: string): void {
  for (const itemType of ALL_ITEM_TYPES) {
    const metadata =
      itemType === "dagger"
        ? ({ chargesRemaining: 2 } as DaggerMetadata)
        : itemType === "painting"
        ? ({ lastCollected: Date.now(), displayed: false } as PaintingMetadata)
        : {};

    const item: InventoryItem = {
      id: crypto.randomUUID(),
      ownerId: playerId,
      itemType,
      metadata,
      createdAt: Date.now(),
    };
    addItem(item);
  }
}
