import { InventoryItem, ItemType } from "../types.js";

/**
 * Finds the first item of a given type in a player's inventory, if any.
 * Used for both single-use defense items (Sigil, Forged Seal, Bent Sigil --
 * caller is responsible for removing it once consumed) and passive checks
 * (Vault Ledger Lock, Warden's Whistle, Grudge Ledger, Weighted Dice) that
 * are just presence checks and never get removed.
 */
export function findItemByType(
  inventory: InventoryItem[],
  ownerId: string,
  itemType: ItemType
): InventoryItem | undefined {
  return inventory.find((item) => item.ownerId === ownerId && item.itemType === itemType);
}

export function hasItemType(inventory: InventoryItem[], ownerId: string, itemType: ItemType): boolean {
  return findItemByType(inventory, ownerId, itemType) !== undefined;
}

/** Kept for the one remaining direct call site that only ever needs the full Sigil, for clarity. */
export function findActiveSigil(inventory: InventoryItem[], ownerId: string): InventoryItem | undefined {
  return findItemByType(inventory, ownerId, "sigil");
}
