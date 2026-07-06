import { InventoryItem } from "../types.js";

/**
 * Finds the first available (unused) Sigil in a player's inventory, if any.
 * The Sigil is single-use: once found and applied by the Dagger flow,
 * the caller is responsible for removing it from the inventory store.
 */
export function findActiveSigil(inventory: InventoryItem[], ownerId: string): InventoryItem | undefined {
  return inventory.find((item) => item.ownerId === ownerId && item.itemType === "sigil");
}
